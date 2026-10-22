from app.documents.processor import (
    _build_html_preview_from_anchors,
    densify_preview_html,
)


def test_preview_uses_span_chunks_without_card_spacing():
    html = _build_html_preview_from_anchors(
        {"chunk-1": "Eerste stuk", "chunk-2": "Tweede stuk"}
    )
    assert '<span id="chunk-1" class="chunk">Eerste stuk</span>' in html
    assert '<span id="chunk-2" class="chunk">Tweede stuk</span>' in html
    assert "<section" not in html
    assert "border-left" not in html
    assert "margin:0 0 .35rem" in html


def test_densify_preview_injects_override_once():
    old = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'/>"
        "<style>.chunk{margin-bottom:1.5rem;padding:.5rem;border-left:3px solid #ccc}</style>"
        "</head><body><section id='chunk-1' class='chunk'><p>Hallo</p></section></body></html>"
    )
    once = densify_preview_html(old)
    twice = densify_preview_html(once)
    assert once.count("vantage-dense") == 1
    assert twice.count("vantage-dense") == 1
    assert "margin:0 0 .35rem!important" in once
