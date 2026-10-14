from app.agents.citations import (
    CitationItem,
    CitationStreamFilter,
    build_citation_items,
    extract_markers,
    sort_citation_items,
    strip_markers_from_stream,
)


class FakeChunk:
    def __init__(self, prompt_index: int, chunk_id: str, content: str):
        self.prompt_index = prompt_index
        self.id = chunk_id
        self.content = content
        self.page_no = 1
        self.section_title = "Intro"
        self.anchor_id = f"chunk-{prompt_index}"


def test_extract_markers_dedupes():
    text = "Zie [[chunk:C1]] en nog [[chunk:C1]]."
    markers = extract_markers(text)
    assert len(markers) == 1
    assert markers[0].prompt_index == 1


def test_unknown_marker_not_in_citations():
    chunks = {1: FakeChunk(1, "uuid-1", "hello world")}
    items = build_citation_items(
        "[[chunk:C1]] [[chunk:C99]]",
        chunks,
        "src",
        "doc.pdf",
        lambda c: None,
    )
    assert len(items) == 1
    assert items[0].chunk_id == "uuid-1"


def test_strip_markers():
    assert "[[chunk:C1]]" not in strip_markers_from_stream("Tekst [[chunk:C1]] meer")


def test_build_citation_items_sorted_by_document_order():
    chunks = {
        12: FakeChunk(12, "uuid-12", "late"),
        3: FakeChunk(3, "uuid-3", "early"),
    }
    chunks[3].page_no = 3
    chunks[12].page_no = 12
    items = build_citation_items(
        "[[chunk:C12]] [[chunk:C3]]",
        chunks,
        "src",
        "doc.pdf",
        lambda c: None,
    )
    assert [i.chunk_id for i in items] == ["uuid-3", "uuid-12"]


def test_sort_citation_items_page_then_prompt_index():
    items = [
        CitationItem("b", "s", "d", 2, None, "x", None, None, 2),
        CitationItem("a", "s", "d", None, None, "x", None, None, 5),
        CitationItem("c", "s", "d", None, None, "x", None, None, 1),
    ]
    sorted_ids = [i.chunk_id for i in sort_citation_items(items)]
    assert sorted_ids == ["b", "c", "a"]


def test_stream_filter_holds_partial_marker():
    f = CitationStreamFilter()
    assert f.feed("foo [[chu") == "foo "
    assert f.feed("nk:C1]] bar") == " bar"
