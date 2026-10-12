from app.agents.tokens import fits_context


def test_fits_context_small_document():
    ok, _ = fits_context(
        system="sys",
        document="short doc",
        history="",
        user_message="hi",
        model_context=8192,
    )
    assert ok is True


def test_rejects_huge_document():
    huge = "word " * 50000
    ok, _ = fits_context(
        system="sys",
        document=huge,
        history="",
        user_message="hi",
        model_context=1024,
    )
    assert ok is False
