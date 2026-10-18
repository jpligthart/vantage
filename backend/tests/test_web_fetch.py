"""Unit tests for DokuWiki / web snapshot fetching."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx

from app.core.config import Settings
from app.documents.web_fetch import (
    collect_page_ids_from_html,
    export_xhtml_url,
    fetch_web_source,
    html_to_text,
    load_manifest,
    page_id_to_filename,
    parse_doku_page_id,
    read_page_texts,
    write_snapshot,
)
from app.documents.web_ingest import create_web_source, refresh_web_source
from app.models.entities import SourceStatus, SourceType, WebMode
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.documents.processor import process_source
from app.documents.fts import search_chunks


def test_parse_doku_page_id_from_query():
    assert parse_doku_page_id("https://wiki.example/doku.php?id=ns:page") == "ns:page"
    assert parse_doku_page_id("https://wiki.example/doku.php?id=start&do=export_xhtml") == "start"


def test_parse_doku_page_id_pretty_url():
    assert parse_doku_page_id("https://wiki.example/guide/install") == "guide:install"


def test_export_xhtml_url():
    url = export_xhtml_url("https://wiki.example/doku.php", "foo:bar")
    assert "id=foo:bar" in url
    assert "do=export_xhtml" in url


def test_page_id_to_filename():
    assert page_id_to_filename("ns:page") == "ns__page.txt"


def test_html_to_text_strips_chrome():
    html = "<html><head><title>My Page</title><script>x</script></head><body><h1>Hi</h1><p>Hello world</p></body></html>"
    text, title = html_to_text(html)
    assert title == "My Page"
    assert "Hello world" in text
    assert "script" not in text.lower()


def test_collect_page_ids_from_index():
    html = """
    <ul>
      <li><a href="/doku.php?id=start">Start</a></li>
      <li><a href="/doku.php?id=policy:rules">Rules</a></li>
      <li><a href="https://other.example/doku.php?id=x">External</a></li>
    </ul>
    """
    ids = collect_page_ids_from_html(html, "https://wiki.example/doku.php")
    assert ids == ["start", "policy:rules"]


def _mock_response(status: int, text: str, *, url: str = "https://wiki.example/doku.php", headers=None):
    response = MagicMock(spec=httpx.Response)
    response.status_code = status
    response.text = text
    response.url = url
    response.headers = headers or {}
    response.raise_for_status = MagicMock()
    if status >= 400:
        response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "err", request=MagicMock(), response=response
        )
    return response


def test_fetch_page_mode_writes_snapshot(tmp_path):
    settings = Settings(data_dir=tmp_path, web_max_pages=50)
    html = "<html><head><title>Start</title></head><body><p>Welcome to the wiki</p></body></html>"

    with patch("app.documents.web_fetch.httpx.Client") as client_cls:
        client = MagicMock()
        client_cls.return_value.__enter__.return_value = client
        client.get.return_value = _mock_response(200, html, url="https://wiki.example/doku.php?id=start")

        result = fetch_web_source(
            "https://wiki.example/doku.php?id=start",
            "page",
            settings,
            force=True,
        )

    assert result.mode == "page"
    assert len(result.pages) == 1
    assert "Welcome to the wiki" in result.pages[0].text

    dest = tmp_path / "snap"
    checksum, count = write_snapshot(dest, result)
    assert count == 1
    assert len(checksum) == 64
    pages = read_page_texts(dest)
    assert pages[0][0] == "start"
    assert "Welcome" in pages[0][2]


def test_fetch_site_mode_from_index(tmp_path):
    settings = Settings(data_dir=tmp_path, web_max_pages=10)
    index_html = """
    <a href="/doku.php?id=start">Start</a>
    <a href="/doku.php?id=extra">Extra</a>
    """
    page_a = "<html><head><title>Start</title></head><body><p>Alpha content unique</p></body></html>"
    page_b = "<html><head><title>Extra</title></head><body><p>Beta content unique</p></body></html>"

    def get_side_effect(url, headers=None):
        url_s = str(url)
        if "do=index" in url_s:
            return _mock_response(200, index_html, url=url_s)
        if "id=start" in url_s:
            return _mock_response(200, page_a, url=url_s)
        if "id=extra" in url_s:
            return _mock_response(200, page_b, url=url_s)
        return _mock_response(404, "missing", url=url_s)

    with (
        patch("app.documents.web_fetch.try_xmlrpc_pagelist", return_value=None),
        patch("app.documents.web_fetch.httpx.Client") as client_cls,
    ):
        client = MagicMock()
        client_cls.return_value.__enter__.return_value = client
        client.get.side_effect = get_side_effect

        result = fetch_web_source(
            "https://wiki.example/doku.php?id=start",
            "site",
            settings,
            force=True,
        )

    assert result.mode == "site"
    assert {p.page_id for p in result.pages} == {"start", "extra"}


def test_create_and_process_web_source_fts(tmp_path):
    settings = Settings(data_dir=tmp_path, web_max_pages=10)
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    # FTS table from migrations isn't in metadata — create minimal FTS
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(chunk_id, document_id, content)"
        )
    db = sessionmaker(bind=engine)()

    html = "<html><head><title>Policy</title></head><body><p>ZeldzaamTrefwoord in policy</p></body></html>"

    with patch("app.documents.web_fetch.httpx.Client") as client_cls:
        client = MagicMock()
        client_cls.return_value.__enter__.return_value = client
        client.get.return_value = _mock_response(
            200, html, url="https://wiki.example/doku.php?id=policy"
        )
        source = create_web_source(
            db,
            settings,
            url="https://wiki.example/doku.php?id=policy",
            mode="page",
            title="Policy wiki",
            is_reference=True,
            is_default=True,
        )

    assert source.type == SourceType.web
    assert source.web_mode == WebMode.page
    assert source.is_default is True
    assert Path(source.storage_path).is_dir()

    process_source(db, source.id)
    db.refresh(source)
    assert source.status == SourceStatus.ready
    assert source.page_count == 1

    from app.models.entities import Document

    doc = db.query(Document).filter(Document.source_id == source.id).one()
    hits = search_chunks(db, [doc.id], "ZeldzaamTrefwoord", limit=5)
    assert len(hits) >= 1
    assert "ZeldzaamTrefwoord" in hits[0].content


def test_refresh_unchanged(tmp_path):
    settings = Settings(data_dir=tmp_path)
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    html = "<html><body><p>Same forever</p></body></html>"

    with patch("app.documents.web_fetch.httpx.Client") as client_cls:
        client = MagicMock()
        client_cls.return_value.__enter__.return_value = client
        client.get.return_value = _mock_response(
            200,
            html,
            url="https://wiki.example/doku.php?id=start",
            headers={"etag": '"v1"'},
        )
        source = create_web_source(
            db,
            settings,
            url="https://wiki.example/doku.php?id=start",
            mode="page",
            title=None,
            is_reference=False,
            is_default=False,
        )

    with patch("app.documents.web_fetch.httpx.Client") as client_cls:
        client = MagicMock()
        client_cls.return_value.__enter__.return_value = client
        client.get.return_value = _mock_response(
            304, "", url="https://wiki.example/doku.php?id=start", headers={"etag": '"v1"'}
        )
        outcome = refresh_web_source(db, source.id, force=False, settings=settings)

    assert outcome == "unchanged"


def test_load_manifest_roundtrip(tmp_path):
    settings = Settings(data_dir=tmp_path)
    from app.documents.web_fetch import FetchResult, PageSnapshot

    result = FetchResult(
        origin_url="https://wiki.example/doku.php?id=a",
        mode="page",
        base_url="https://wiki.example/doku.php",
        pages=[
            PageSnapshot(
                page_id="a",
                title="A",
                url="https://wiki.example/doku.php?id=a",
                text="Hello",
            ).with_checksum()
        ],
        name="A",
    )
    dest = tmp_path / "w"
    write_snapshot(dest, result)
    manifest = load_manifest(dest)
    assert manifest["mode"] == "page"
    assert manifest["pages"][0]["id"] == "a"
