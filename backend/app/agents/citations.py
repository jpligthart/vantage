import re
from dataclasses import dataclass

MARKER_RE = re.compile(r"\[\[chunk:(C\d+)\]\]")


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
        try:
            idx = int(marker[1:])
        except ValueError:
            continue
        result.append(ParsedCitation(prompt_index=idx, marker=marker))
    return result


def build_citation_items(
    full_text: str,
    index_to_chunk: dict[int, object],
    source_id: str,
    document_name: str,
    bbox_loader,
) -> list[CitationItem]:
    items: list[CitationItem] = []
    for parsed in extract_markers(full_text):
        chunk = index_to_chunk.get(parsed.prompt_index)
        if chunk is None:
            continue
        excerpt = chunk.content[:500] if len(chunk.content) > 500 else chunk.content
        items.append(
            CitationItem(
                chunk_id=chunk.id,
                source_id=source_id,
                document_name=document_name,
                page_no=chunk.page_no,
                section_title=chunk.section_title,
                excerpt=excerpt,
                bbox=bbox_loader(chunk),
                anchor_id=getattr(chunk, "anchor_id", None),
                prompt_index=getattr(chunk, "prompt_index", None),
            )
        )
    return items
