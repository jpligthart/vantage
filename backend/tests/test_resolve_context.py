from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.agents.chat import resolve_document_context
from app.core.database import Base
from app.documents.fts import index_chunk
from app.models.entities import Source, SourceChunk, SourceStatus, SourceType


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


def _source(name: str, *, is_reference: bool = False) -> Source:
    return Source(
        name=name,
        type=SourceType.text,
        storage_path=f"/tmp/{name}",
        checksum="a" * 64,
        status=SourceStatus.ready,
        is_reference=is_reference,
    )


def _chunk(document_id: str, index: int, content: str, chunk_id: str | None = None) -> SourceChunk:
    return SourceChunk(
        id=chunk_id or f"{document_id}-{index}",
        document_id=document_id,
        prompt_index=index,
        anchor_id=f"a{index}",
        content=content,
    )


def test_resolve_keeps_full_document_when_everything_fits():
    db = _db()
    student = _source("verslag.txt")
    ref = _source("kader.txt", is_reference=True)
    docs = [
        (student, [_chunk("doc-s", 1, "Korte studenttekst over architectuur.")]),
        (ref, [_chunk("doc-r", 1, "Kort kader over architectuur niveau 2.")]),
    ]
    text, index_map, sizes, strategy, error = resolve_document_context(
        db,
        docs,
        system="sys",
        user_message="Hoe zit architectuur in dit verslag?",
        memory_block="",
        model_context=32_000,
        search_query="architectuur",
    )
    assert error is None
    assert strategy == "full_document"
    assert "STUDENTENWERK:" in text
    assert "KADERS EN RICHTLIJNEN:" in text
    assert "R1C1" in index_map
    assert len(sizes) == 2


def test_resolve_retrieves_references_when_full_context_overflows():
    db = _db()
    student = _source("verslag.txt")
    ref = _source("hbo-i.txt", is_reference=True)
    # ~1200 tokens each: five chunks overflow an 8k window; one or two still fit.
    filler = ("competentiebeschrijving tabellen " * 400).strip()
    ref_chunks = [
        _chunk("doc-r", 1, f"Inleiding algemeen. {filler}", "r1"),
        _chunk("doc-r", 2, f"Architectuur niveau 2 vereist onderbouwing. {filler}", "r2"),
        _chunk("doc-r", 3, f"Security en privacy eisen in detail. {filler}", "r3"),
        _chunk("doc-r", 4, f"Testen en kwaliteit. {filler}", "r4"),
        _chunk("doc-r", 5, f"Proces en methoden. {filler}", "r5"),
    ]
    student_chunks = [_chunk("doc-s", 1, "De student kiest een layered architectuur.")]
    db.add_all(ref_chunks + student_chunks)
    db.commit()
    for chunk in ref_chunks:
        index_chunk(db, chunk.id, chunk.document_id, chunk.content)
    db.commit()

    docs = [(student, student_chunks), (ref, ref_chunks)]
    text, index_map, sizes, strategy, error = resolve_document_context(
        db,
        docs,
        system="Je bent een assistent.",
        user_message="Toets de architectuurkeuze aan het kader.",
        memory_block="",
        model_context=8192,
        search_query="architectuur niveau",
    )
    assert error is None
    assert strategy == "retrieved_references"
    assert "layered architectuur" in text
    assert "KADERS EN RICHTLIJNEN:" in text
    assert "architectuur niveau 2" in text.lower()
    assert any(item.get("retrieved") for item in sizes if item.get("isReference"))
    assert len(index_map) < 1 + len(ref_chunks)


def test_resolve_errors_when_student_work_alone_is_too_large():
    db = _db()
    student = _source("portfolio.txt")
    ref = _source("kader.txt", is_reference=True)
    huge = ("portfolio sectie met veel tekst " * 200).strip()
    student_chunks = [_chunk("doc-s", i, huge, f"s{i}") for i in range(1, 6)]
    ref_chunks = [_chunk("doc-r", 1, "Klein kader over architectuur.")]
    docs = [(student, student_chunks), (ref, ref_chunks)]

    text, index_map, sizes, strategy, error = resolve_document_context(
        db,
        docs,
        system="sys",
        user_message="Vat samen",
        memory_block="",
        model_context=1200,
        search_query="architectuur",
    )
    assert error == "document_too_large"
    assert strategy == "full_document"
    assert sizes  # full sizes reported for the error UI
