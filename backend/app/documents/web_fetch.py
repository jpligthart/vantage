"""Fetch and snapshot DokuWiki pages (and generic single-page URLs)."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlparse, urlunparse
from xmlrpc.client import Fault, ServerProxy

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

MANIFEST_NAME = "manifest.json"
PAGES_DIR = "pages"

_DOKU_ID_RE = re.compile(r"^[a-zA-Z0-9_:\.\-]+$")
_SAFE_FILE_RE = re.compile(r"[^a-zA-Z0-9_.\-]+")


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip = 0
        self.title: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in {"p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._in_title:
            text = data.strip()
            if text and not self.title:
                self.title = text
            return
        if data.strip():
            self._chunks.append(data)

    def text(self) -> str:
        raw = "".join(self._chunks)
        lines = [ln.strip() for ln in raw.splitlines()]
        collapsed = "\n".join(ln for ln in lines if ln)
        return re.sub(r"[ \t]{2,}", " ", collapsed).strip()


class _LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        for key, value in attrs:
            if key == "href" and value:
                self.hrefs.append(value)


@dataclass
class PageSnapshot:
    page_id: str
    title: str
    url: str
    text: str
    etag: str | None = None
    last_modified: str | None = None
    checksum: str = ""

    def with_checksum(self) -> PageSnapshot:
        self.checksum = hashlib.sha256(self.text.encode("utf-8")).hexdigest()
        return self


@dataclass
class FetchResult:
    origin_url: str
    mode: str
    base_url: str
    pages: list[PageSnapshot]
    name: str


def html_to_text(html: str) -> tuple[str, str | None]:
    parser = _HTMLTextExtractor()
    parser.feed(html)
    parser.close()
    return parser.text(), parser.title


def _normalize_base(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be http(s) with a host")
    # Prefer doku.php root when present in path
    path = parsed.path or "/"
    if "/doku.php" in path:
        path = path[: path.index("/doku.php") + len("/doku.php")]
    elif path.endswith(".php"):
        path = path.rsplit("/", 1)[0] + "/"
    if not path.endswith("/") and not path.endswith("doku.php"):
        # Keep directory-like bases with trailing slash for urljoin
        if "." not in Path(path).name:
            path = path.rstrip("/") + "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def parse_doku_page_id(url: str) -> str | None:
    parsed = urlparse(url.strip())
    qs = parse_qs(parsed.query)
    if "id" in qs and qs["id"]:
        page_id = unquote(qs["id"][0]).strip()
        return page_id or None
    path = unquote(parsed.path or "").strip("/")
    if not path or path.endswith("doku.php"):
        return "start"
    # Pretty URLs: /wiki/namespace:page or /namespace/page
    if path.startswith("doku.php"):
        return "start"
    # Drop leading wiki/ or similar single segment mounts that are not page ids
    segments = [s for s in path.split("/") if s and s != "doku.php"]
    if not segments:
        return "start"
    joined = ":".join(segments)
    # Heuristic: if last segment looks like a file, skip
    if "." in segments[-1] and not segments[-1].endswith(".txt"):
        return None
    return joined


def page_id_to_filename(page_id: str) -> str:
    safe = _SAFE_FILE_RE.sub("_", page_id.replace(":", "__"))
    return f"{safe or 'page'}.txt"


def export_xhtml_url(base_url: str, page_id: str) -> str:
    parsed = urlparse(base_url)
    if parsed.path.endswith("doku.php"):
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                "",
                f"id={page_id}&do=export_xhtml",
                "",
            )
        )
    # Pretty-URL wiki: still hit doku.php when possible
    doku = urljoin(base_url if base_url.endswith("/") else base_url + "/", "doku.php")
    return f"{doku}?id={page_id}&do=export_xhtml"


def index_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if parsed.path.endswith("doku.php"):
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "do=index", ""))
    doku = urljoin(base_url if base_url.endswith("/") else base_url + "/", "doku.php")
    return f"{doku}?do=index"


def xmlrpc_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}/"
    # Prefer site root /lib/exe/xmlrpc.php
    if "/doku.php" in (parsed.path or ""):
        root_path = (parsed.path or "")[: (parsed.path or "").index("/doku.php")]
        root = f"{parsed.scheme}://{parsed.netloc}{root_path}/"
    return urljoin(root, "lib/exe/xmlrpc.php")


def _same_host(base: str, candidate: str) -> bool:
    return urlparse(base).netloc == urlparse(candidate).netloc


def collect_page_ids_from_html(html: str, base_url: str) -> list[str]:
    collector = _LinkCollector()
    collector.feed(html)
    collector.close()
    found: list[str] = []
    seen: set[str] = set()
    for href in collector.hrefs:
        absolute = urljoin(base_url, href)
        if not _same_host(base_url, absolute):
            continue
        page_id = parse_doku_page_id(absolute)
        if not page_id or page_id in seen:
            continue
        if not _DOKU_ID_RE.match(page_id):
            continue
        # Skip media / UI actions
        if page_id.startswith(("http", "www")):
            continue
        seen.add(page_id)
        found.append(page_id)
    return found


def try_xmlrpc_pagelist(base_url: str, timeout: float) -> list[tuple[str, str | None]] | None:
    endpoint = xmlrpc_url(base_url)
    try:
        proxy = ServerProxy(endpoint, allow_none=True)
        # dokuwiki.getPagelist(namespace, options) — empty namespace = all
        try:
            pages = proxy.dokuwiki.getPagelist("", {"depth": 0})  # type: ignore[attr-defined]
        except Fault:
            pages = proxy.wiki.getAllPages()  # type: ignore[attr-defined]
        result: list[tuple[str, str | None]] = []
        for item in pages or []:
            if isinstance(item, dict):
                page_id = str(item.get("id") or item.get("name") or "").strip()
                lastmod = item.get("lastModified") or item.get("mtime")
                if isinstance(lastmod, datetime):
                    lastmod = lastmod.isoformat()
                elif lastmod is not None:
                    lastmod = str(lastmod)
                if page_id:
                    result.append((page_id, lastmod))
            elif isinstance(item, str) and item.strip():
                result.append((item.strip(), None))
        return result or None
    except Exception as exc:
        logger.info("DokuWiki XML-RPC unavailable at %s: %s", endpoint, exc)
        return None


def _client(settings: Settings) -> httpx.Client:
    return httpx.Client(
        timeout=settings.web_fetch_timeout,
        headers={"User-Agent": settings.web_user_agent},
        follow_redirects=True,
    )


def fetch_page_content(
    client: httpx.Client,
    base_url: str,
    page_id: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    fallback_url: str | None = None,
) -> PageSnapshot | None:
    """Return snapshot, or None if not modified (304)."""
    url = export_xhtml_url(base_url, page_id)
    headers: dict[str, str] = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    response = client.get(url, headers=headers)
    if response.status_code == 304:
        return None
    if response.status_code >= 400 and fallback_url:
        response = client.get(fallback_url, headers=headers)
        if response.status_code == 304:
            return None
    response.raise_for_status()

    text, title = html_to_text(response.text)
    if not text.strip():
        raise ValueError(f"Lege pagina: {page_id}")

    return PageSnapshot(
        page_id=page_id,
        title=(title or page_id)[:512],
        url=str(response.url),
        text=text,
        etag=response.headers.get("etag"),
        last_modified=response.headers.get("last-modified"),
    ).with_checksum()


def fetch_generic_page(client: httpx.Client, url: str) -> PageSnapshot:
    response = client.get(url)
    response.raise_for_status()
    text, title = html_to_text(response.text)
    if not text.strip():
        raise ValueError("Pagina bevat geen tekst")
    page_id = parse_doku_page_id(url) or "page"
    return PageSnapshot(
        page_id=page_id,
        title=(title or page_id)[:512],
        url=str(response.url),
        text=text,
        etag=response.headers.get("etag"),
        last_modified=response.headers.get("last-modified"),
    ).with_checksum()


def discover_site_pages(
    client: httpx.Client, base_url: str, settings: Settings
) -> list[tuple[str, str | None]]:
    rpc_pages = try_xmlrpc_pagelist(base_url, settings.web_fetch_timeout)
    if rpc_pages:
        return rpc_pages[: settings.web_max_pages]

    # Index page crawl
    idx = index_url(base_url)
    response = client.get(idx)
    response.raise_for_status()
    page_ids = collect_page_ids_from_html(response.text, str(response.url))
    if not page_ids:
        # Fallback: at least the start page from origin
        start = parse_doku_page_id(base_url) or "start"
        page_ids = [start]
    return [(pid, None) for pid in page_ids[: settings.web_max_pages]]


def fetch_web_source(
    url: str,
    mode: str,
    settings: Settings,
    *,
    existing_manifest: dict | None = None,
    force: bool = False,
) -> FetchResult:
    origin = url.strip()
    if not origin:
        raise ValueError("URL is verplicht")
    base = _normalize_base(origin)
    mode = mode if mode in {"page", "site"} else "page"

    with _client(settings) as client:
        pages: list[PageSnapshot] = []
        old_by_id: dict[str, dict] = {}
        if existing_manifest:
            for entry in existing_manifest.get("pages") or []:
                if isinstance(entry, dict) and entry.get("id"):
                    old_by_id[str(entry["id"])] = entry

        if mode == "page":
            page_id = parse_doku_page_id(origin) or "start"
            old = old_by_id.get(page_id, {})
            try:
                snap = fetch_page_content(
                    client,
                    base,
                    page_id,
                    etag=None if force else old.get("etag"),
                    last_modified=None if force else old.get("last_modified"),
                    fallback_url=origin,
                )
            except Exception:
                # Non-DokuWiki or export disabled: fetch raw URL
                snap = fetch_generic_page(client, origin)
            if snap is None and old:
                # Unchanged — reconstruct from disk text if present
                raise _Unchanged()
            if snap is None:
                snap = fetch_generic_page(client, origin)
            pages.append(snap)
            name = snap.title
        else:
            discovered = discover_site_pages(client, base, settings)
            unchanged_count = 0
            for page_id, rpc_lastmod in discovered:
                old = old_by_id.get(page_id, {})
                etag = None if force else old.get("etag")
                last_mod = None if force else (old.get("last_modified") or rpc_lastmod)
                try:
                    snap = fetch_page_content(
                        client,
                        base,
                        page_id,
                        etag=etag,
                        last_modified=last_mod if isinstance(last_mod, str) else None,
                    )
                except Exception as exc:
                    logger.warning("Skip page %s: %s", page_id, exc)
                    continue
                if snap is None:
                    unchanged_count += 1
                    # Keep previous snapshot marker for merge
                    if old.get("checksum") and old.get("file"):
                        pages.append(
                            PageSnapshot(
                                page_id=page_id,
                                title=str(old.get("title") or page_id),
                                url=str(old.get("url") or export_xhtml_url(base, page_id)),
                                text="",  # filled from disk later
                                etag=old.get("etag"),
                                last_modified=old.get("last_modified"),
                                checksum=str(old["checksum"]),
                            )
                        )
                    continue
                pages.append(snap)
            if not pages:
                raise ValueError("Geen wiki-pagina's gevonden")
            if unchanged_count == len(discovered) and existing_manifest:
                raise _Unchanged()
            name = urlparse(origin).netloc or "DokuWiki"

    return FetchResult(origin_url=origin, mode=mode, base_url=base, pages=pages, name=name)


class _Unchanged(Exception):
    """All pages returned 304 / unchanged."""


def write_snapshot(
    dest_dir: Path,
    result: FetchResult,
    *,
    previous_dir: Path | None = None,
) -> tuple[str, int]:
    """Write manifest + page files. Returns (manifest_checksum, page_count)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    pages_path = dest_dir / PAGES_DIR
    pages_path.mkdir(parents=True, exist_ok=True)

    manifest_pages: list[dict] = []
    for page in result.pages:
        filename = page_id_to_filename(page.page_id)
        file_rel = f"{PAGES_DIR}/{filename}"
        target = dest_dir / file_rel
        if page.text:
            target.write_text(page.text, encoding="utf-8")
            checksum = page.checksum or hashlib.sha256(page.text.encode("utf-8")).hexdigest()
        else:
            # Unchanged page: copy from previous snapshot if needed
            prev = None
            if previous_dir:
                prev_candidate = previous_dir / file_rel
                if prev_candidate.is_file():
                    prev = prev_candidate
            if prev and prev.is_file():
                if prev.resolve() != target.resolve():
                    target.write_text(prev.read_text(encoding="utf-8"), encoding="utf-8")
                checksum = page.checksum or hashlib.sha256(
                    target.read_text(encoding="utf-8").encode("utf-8")
                ).hexdigest()
            elif target.is_file():
                checksum = page.checksum or hashlib.sha256(
                    target.read_text(encoding="utf-8").encode("utf-8")
                ).hexdigest()
            else:
                continue
        manifest_pages.append(
            {
                "id": page.page_id,
                "title": page.title,
                "url": page.url,
                "file": file_rel,
                "etag": page.etag,
                "last_modified": page.last_modified,
                "checksum": checksum,
            }
        )

    if not manifest_pages:
        raise ValueError("Geen pagina-inhoud opgeslagen")

    manifest = {
        "origin_url": result.origin_url,
        "mode": result.mode,
        "base_url": result.base_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "pages": manifest_pages,
    }
    manifest_path = dest_dir / MANIFEST_NAME
    encoded = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    manifest_path.write_text(encoded.decode("utf-8"), encoding="utf-8")
    checksum = hashlib.sha256(encoded).hexdigest()
    return checksum, len(manifest_pages)


def load_manifest(storage_path: str | Path) -> dict:
    path = Path(storage_path)
    if path.is_dir():
        manifest_path = path / MANIFEST_NAME
    else:
        manifest_path = path
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest missing: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def read_page_texts(storage_path: str | Path) -> list[tuple[str, str, str]]:
    """Return list of (page_id, title, text)."""
    root = Path(storage_path)
    if not root.is_dir():
        raise FileNotFoundError(f"Web source directory missing: {root}")
    manifest = load_manifest(root)
    rows: list[tuple[str, str, str]] = []
    for entry in manifest.get("pages") or []:
        page_id = str(entry.get("id") or "page")
        title = str(entry.get("title") or page_id)
        rel = entry.get("file")
        if not rel:
            continue
        file_path = root / str(rel)
        if not file_path.is_file():
            continue
        text = file_path.read_text(encoding="utf-8").strip()
        if text:
            rows.append((page_id, title, text))
    return rows


def is_unchanged_error(exc: BaseException) -> bool:
    return isinstance(exc, _Unchanged)
