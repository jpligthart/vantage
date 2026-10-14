import re
from dataclasses import dataclass

MARKER_RE = re.compile(r"\[\[chunk:((?:D\d+)?C\d+)\]\]")
_C_PART_RE = re.compile(r"C(\d+)$")


@dataclass
class ParsedCitation:
    prompt_index: int
    marker: str


@dataclass
class CitationItem:
    chunk_id: str
    source_id: str
    document_name: str
    page_no: int | None
    section_title: str | None
    excerpt: str
    bbox: dict | None
    anchor_id: str | None
    prompt_index: int | None


def strip_markers_from_stream(text: str) -> str:
    return MARKER_RE.sub("", text)


class CitationStreamFilter:
    """Buffer tail to avoid leaking partial [[chunk:...]] markers in SSE tokens."""

    def __init__(self) -> None:
        self._buffer = ""
        self._hold = ""

    def feed(self, chunk: str) -> str:
        self._buffer += chunk
        safe_end = len(self._buffer)
        if "[[" in self._buffer:
            idx = self._buffer.rfind("[[")
            if idx >= 0 and "]]" not in self._buffer[idx:]:
                safe_end = idx
        emit = self._buffer[:safe_end]
        self._buffer = self._buffer[safe_end:]
        cleaned = strip_markers_from_stream(emit)
        return cleaned

    def flush(self) -> str:
        rest = strip_markers_from_stream(self._buffer)
        self._buffer = ""
        return rest


def extract_markers(full_text: str) -> list[ParsedCitation]:
    seen: set[str] = set()
    result: list[ParsedCitation] = []
    for match in MARKER_RE.finditer(full_text):
        marker = match.group(1)
        if marker in seen:
            continue
        seen.add(marker)
        c_match = _C_PART_RE.search(marker)
        if c_match is None:
            continue
        result.append(ParsedCitation(prompt_index=int(c_match.group(1)), marker=marker))
    return result


def _document_order_key(
    page_no: int | None,
    prompt_index: int | None,
    chunk_id: str,
) -> tuple[int, int, str]:
    missing = 2**31 - 1
    return (
        page_no if page_no is not None else missing,
        prompt_index if prompt_index is not None else missing,
        chunk_id,
    )


def sort_citation_items(items: list[CitationItem]) -> list[CitationItem]:
    return sorted(
        items,
        key=lambda c: _document_order_key(c.page_no, c.prompt_index, c.chunk_id),
    )


def sort_citation_payloads(payloads: list[dict]) -> list[dict]:
    return sorted(
        payloads,
        key=lambda p: _document_order_key(
            p.get("pageNo"),
            p.get("promptIndex"),
            p.get("chunkId") or "",
        ),
    )


def build_citation_items(
    full_text: str,
    index_to_chunk: dict[int, object],
    source_id: str,
    document_name: str,
    bbox_loader,
) -> list[CitationItem]:
    items: list[CitationItem] = []
    for parsed in extract_markers(full_text):
        chunk = index_to_chunk.get(parsed.marker)
        if chunk is None:
            chunk = index_to_chunk.get(parsed.prompt_index)
        if chunk is None:
            continue
        excerpt = chunk.content[:500] if len(chunk.content) > 500 else chunk.content
        items.append(
            CitationItem(
                chunk_id=chunk.id,
                source_id=getattr(chunk, "source_id", None) or source_id,
                document_name=getattr(chunk, "document_name", None) or document_name,
                page_no=chunk.page_no,
                section_title=chunk.section_title,
                excerpt=excerpt,
                bbox=bbox_loader(chunk),
                anchor_id=getattr(chunk, "anchor_id", None),
                prompt_index=getattr(chunk, "prompt_index", None),
            )
        )
    return sort_citation_items(items)
