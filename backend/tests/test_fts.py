from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.documents.fts import (
    fallback_leading_chunks,
    index_chunk,
    normalize_fts_query,
    search_chunks,
)
from app.models.entities import SourceChunk


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
                    chunk_id UNINDEXED,
                    document_id UNINDEXED,
                    content,
                    tokenize='unicode61'
                )
                """
            )
        )
    return sessionmaker(bind=engine)()


def test_normalize_fts_query_strips_stopwords_and_ors():
    q = normalize_fts_query("Wat zegt het kader over architectuur en security?")
    assert q is not None
    assert "architectuur" in q
    assert "security" in q
    assert " OR " in q
    assert '"het"' not in q
    assert '"over"' not in q


def test_normalize_fts_query_empty():
    assert normalize_fts_query("") is None
    assert normalize_fts_query("de het en van") is None


def test_search_chunks_ranks_relevant_hits():
    db = _db()
    c1 = SourceChunk(
        id="c1",
        document_id="doc-r",
        prompt_index=1,
        anchor_id="a1",
        content="Inleiding over het HBO-i domein in het algemeen.",
    )
    c2 = SourceChunk(
        id="c2",
        document_id="doc-r",
        prompt_index=2,
        anchor_id="a2",
        content="Architectuur niveau 2 vereist onderbouwde ontwerpkeuzes.",
    )
    c3 = SourceChunk(
        id="c3",
        document_id="doc-other",
        prompt_index=1,
        anchor_id="a3",
        content="Architectuur buiten scope van deze zoekactie.",
    )
    db.add_all([c1, c2, c3])
    db.commit()
    index_chunk(db, c1.id, c1.document_id, c1.content)
    index_chunk(db, c2.id, c2.document_id, c2.content)
    index_chunk(db, c3.id, c3.document_id, c3.content)
    db.commit()

    hits = search_chunks(db, ["doc-r"], "architectuur niveau", limit=10)
    assert [h.id for h in hits] == ["c2"]


def test_fallback_leading_chunks():
    db = _db()
    chunks = [
        SourceChunk(
            id=f"c{i}",
            document_id="doc-r",
            prompt_index=i,
            anchor_id=f"a{i}",
            content=f"blok {i}",
        )
        for i in range(1, 6)
    ]
    db.add_all(chunks)
    db.commit()

    leading = fallback_leading_chunks(db, ["doc-r"], per_document=2, limit=10)
    assert [c.prompt_index for c in leading] == [1, 2]
