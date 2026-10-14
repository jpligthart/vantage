from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agents.chat import build_multi_document_context
from app.core.database import Base
from app.models.entities import Source, SourceChunk, SourceStatus, SourceType
from app.sessions.service import (
    attach_source,
    conversation_source_ids,
    create_conversation,
    create_session,
    list_conversations,
    session_sources,
    set_conversation_sources,
    update_session,
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _source(name: str, *, student: str | None = None) -> Source:
    return Source(
        name=name,
        type=SourceType.text,
        storage_path=f"/tmp/{name}",
        checksum="a" * 64,
        status=SourceStatus.ready,
        student=student,
    )


def test_session_starts_with_one_conversation():
    db = _db()
    session = create_session(db, "Casus", student="Ada")
    conversations = list_conversations(db, session.id)
    assert [c.title for c in conversations] == ["Gesprek 1"]
    assert session.student == "Ada"


def test_attach_multiple_sources_and_stamp_labels():
    db = _db()
    session = create_session(db, "Casus", student="Ada", subject="Ontwerp")
    first = _source("verslag.txt")
    second = _source("reflectie.txt", student="Iemand anders")
    db.add_all([first, second])
    db.commit()

    attach_source(db, session.id, first.id)
    attach_source(db, session.id, second.id)

    attached = session_sources(db, session.id)
    assert {s.name for s in attached} == {"verslag.txt", "reflectie.txt"}
    db.refresh(first)
    db.refresh(second)
    assert first.student == "Ada"
    assert first.subject == "Ontwerp"
    assert second.student == "Iemand anders"
    assert second.subject == "Ontwerp"


def test_conversation_pins_empty_means_all():
    db = _db()
    session = create_session(db, "Casus")
    first = _source("a.txt")
    second = _source("b.txt")
    db.add_all([first, second])
    db.commit()
    attach_source(db, session.id, first.id)
    attach_source(db, session.id, second.id)
    conversation = list_conversations(db, session.id)[0]

    assert conversation_source_ids(db, conversation.id) == []
    pinned = set_conversation_sources(db, session.id, conversation.id, [first.id])
    assert pinned == [first.id]
    assert set_conversation_sources(db, session.id, conversation.id, [first.id, second.id]) == []


def test_new_conversation_does_not_copy_messages():
    db = _db()
    session = create_session(db, "Casus")
    extra = create_conversation(db, session.id)
    assert extra.title == "Gesprek 2"
    assert [c.title for c in list_conversations(db, session.id)] == ["Gesprek 1", "Gesprek 2"]


def test_update_session_stamps_unlabeled_sources():
    db = _db()
    session = create_session(db, "Casus")
    source = _source("a.txt")
    db.add(source)
    db.commit()
    attach_source(db, session.id, source.id)
    update_session(db, session.id, student="Ada", student_set=True)
    db.refresh(source)
    assert source.student == "Ada"


def test_multi_document_markers_do_not_collide():
    first = _source("verslag.txt")
    second = _source("reflectie.txt")
    chunks_a = [
        SourceChunk(
            document_id="doc-a",
            prompt_index=1,
            anchor_id="a1",
            content="eerste verslag",
        )
    ]
    chunks_b = [
        SourceChunk(
            document_id="doc-b",
            prompt_index=1,
            anchor_id="b1",
            content="eerste reflectie",
        )
    ]
    text, index_map, sizes = build_multi_document_context(
        [(first, chunks_a), (second, chunks_b)]
    )
    assert "[D1C1]" in text
    assert "[D2C1]" in text
    assert index_map["D1C1"].source_id == first.id
    assert index_map["D2C1"].content == "eerste reflectie"
    assert [item["name"] for item in sizes] == ["verslag.txt", "reflectie.txt"]
    assert all(item["tokens"] > 0 for item in sizes)
