from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.documents.service import get_source_or_404
from app.models.entities import (
    AnalysisSession,
    Conversation,
    ConversationMessage,
    ConversationSource,
    SessionNote,
    SessionSource,
    Source,
)

NOTE_MAX_CHARS = 8000
FEEDBACK_MAX_CHARS = 32000


def _touch(session: AnalysisSession) -> None:
    session.updated_at = datetime.now(timezone.utc)


def list_sessions(db: Session) -> list[AnalysisSession]:
    rows = (
        db.query(AnalysisSession)
        .options(joinedload(AnalysisSession.conversations))
        .order_by(AnalysisSession.updated_at.desc())
        .all()
    )
    seen: dict[str, AnalysisSession] = {}
    for row in rows:
        seen.setdefault(row.id, row)
    return list(seen.values())


def create_session(
    db: Session,
    title: str,
    preferred_model: str | None = None,
    student: str | None = None,
    subject: str | None = None,
) -> AnalysisSession:
    session = AnalysisSession(
        title=title,
        preferred_model=preferred_model,
        student=_blank_to_none(student),
        subject=_blank_to_none(subject),
    )
    db.add(session)
    db.flush()
    db.add(Conversation(session_id=session.id, title="Gesprek 1"))
    db.commit()
    db.refresh(session)
    return session


def get_session_or_404(db: Session, session_id: str) -> AnalysisSession:
    session = db.get(AnalysisSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def get_conversation_or_404(db: Session, session_id: str, conversation_id: str) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.session_id != session_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def session_sources(db: Session, session_id: str) -> list[Source]:
    return (
        db.query(Source)
        .join(SessionSource, SessionSource.source_id == Source.id)
        .filter(SessionSource.session_id == session_id)
        .order_by(Source.imported_at.asc(), Source.name.asc())
        .all()
    )


def _stamp_source_labels(session: AnalysisSession, source: Source) -> None:
    if session.student and not source.student:
        source.student = session.student
    if session.subject and not source.subject:
        source.subject = session.subject


def attach_source(db: Session, session_id: str, source_id: str) -> None:
    session = get_session_or_404(db, session_id)
    source = get_source_or_404(db, source_id)
    existing = (
        db.query(SessionSource)
        .filter(
            SessionSource.session_id == session.id,
            SessionSource.source_id == source.id,
        )
        .first()
    )
    _stamp_source_labels(session, source)
    if existing is None:
        db.add(SessionSource(session_id=session.id, source_id=source.id))
    _touch(session)
    db.commit()


def detach_source(db: Session, session_id: str, source_id: str) -> None:
    session = get_session_or_404(db, session_id)
    link = (
        db.query(SessionSource)
        .filter(
            SessionSource.session_id == session.id,
            SessionSource.source_id == source_id,
        )
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Source is not attached to this session")
    conversation_ids = [
        row.id
        for row in db.query(Conversation.id).filter(Conversation.session_id == session.id).all()
    ]
    if conversation_ids:
        (
            db.query(ConversationSource)
            .filter(
                ConversationSource.conversation_id.in_(conversation_ids),
                ConversationSource.source_id == source_id,
            )
            .delete(synchronize_session=False)
        )
    db.delete(link)
    _touch(session)
    db.commit()


def update_session(
    db: Session,
    session_id: str,
    *,
    title: str | None = None,
    preferred_model: str | None = None,
    student: str | None = None,
    subject: str | None = None,
    student_set: bool = False,
    subject_set: bool = False,
) -> AnalysisSession:
    session = get_session_or_404(db, session_id)
    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Title is required")
        session.title = cleaned
    if preferred_model is not None:
        session.preferred_model = preferred_model or None
    if student_set:
        session.student = _blank_to_none(student)
    if subject_set:
        session.subject = _blank_to_none(subject)
    if student_set or subject_set:
        for source in session_sources(db, session.id):
            _stamp_source_labels(session, source)
    _touch(session)
    db.commit()
    db.refresh(session)
    return session


def list_conversations(db: Session, session_id: str) -> list[Conversation]:
    get_session_or_404(db, session_id)
    return (
        db.query(Conversation)
        .filter(Conversation.session_id == session_id)
        .order_by(Conversation.created_at.asc())
        .all()
    )


def create_conversation(db: Session, session_id: str, title: str | None = None) -> Conversation:
    session = get_session_or_404(db, session_id)
    count = db.query(Conversation).filter(Conversation.session_id == session.id).count()
    conversation = Conversation(
        session_id=session.id,
        title=(title or "").strip() or f"Gesprek {count + 1}",
    )
    db.add(conversation)
    _touch(session)
    db.commit()
    db.refresh(conversation)
    return conversation


def rename_conversation(
    db: Session, session_id: str, conversation_id: str, title: str
) -> Conversation:
    conversation = get_conversation_or_404(db, session_id, conversation_id)
    cleaned = title.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Title is required")
    conversation.title = cleaned
    conversation.updated_at = datetime.now(timezone.utc)
    _touch(conversation.session)
    db.commit()
    db.refresh(conversation)
    return conversation


def delete_conversation(db: Session, session_id: str, conversation_id: str) -> None:
    conversation = get_conversation_or_404(db, session_id, conversation_id)
    session = conversation.session
    db.delete(conversation)
    _touch(session)
    db.commit()


def conversation_source_ids(db: Session, conversation_id: str) -> list[str]:
    rows = (
        db.query(ConversationSource.source_id)
        .filter(ConversationSource.conversation_id == conversation_id)
        .all()
    )
    return [row[0] for row in rows]


def set_conversation_sources(
    db: Session, session_id: str, conversation_id: str, source_ids: list[str]
) -> list[str]:
    conversation = get_conversation_or_404(db, session_id, conversation_id)
    attached = [source.id for source in session_sources(db, session_id)]
    attached_set = set(attached)
    unknown = [source_id for source_id in source_ids if source_id not in attached_set]
    if unknown:
        raise HTTPException(status_code=400, detail="Source is not attached to this session")
    unique_ids = list(dict.fromkeys(source_ids))
    if not unique_ids:
        raise HTTPException(status_code=400, detail="Kies minstens één bron voor dit gesprek")

    db.query(ConversationSource).filter(
        ConversationSource.conversation_id == conversation.id
    ).delete(synchronize_session=False)

    if set(unique_ids) == attached_set:
        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()
        return []

    ordered = [source_id for source_id in attached if source_id in set(unique_ids)]
    for source_id in ordered:
        db.add(ConversationSource(conversation_id=conversation.id, source_id=source_id))
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    return ordered


def get_session_memory(db: Session, session_id: str) -> str:
    get_session_or_404(db, session_id)
    note = db.query(SessionNote).filter(SessionNote.session_id == session_id).first()
    return note.content if note else ""


def set_session_memory(db: Session, session_id: str, content: str) -> str:
    session = get_session_or_404(db, session_id)
    text = content.strip()
    if len(text) > NOTE_MAX_CHARS:
        raise HTTPException(status_code=400, detail="Sessiegeheugen is te lang")
    note = db.query(SessionNote).filter(SessionNote.session_id == session.id).first()
    if note is None:
        note = SessionNote(session_id=session.id, content=text)
        db.add(note)
    else:
        note.content = text
        note.updated_at = datetime.now(timezone.utc)
    _touch(session)
    db.commit()
    return note.content


def append_session_memory(db: Session, session_id: str, content: str) -> str:
    current = get_session_memory(db, session_id)
    addition = content.strip()
    if not addition:
        raise HTTPException(status_code=400, detail="Niets om toe te voegen")
    combined = f"{current.rstrip()}\n\n{addition}" if current.strip() else addition
    if len(combined) > NOTE_MAX_CHARS:
        combined = combined[-NOTE_MAX_CHARS:]
    return set_session_memory(db, session_id, combined)


def get_feedback_draft(db: Session, session_id: str) -> str:
    session = get_session_or_404(db, session_id)
    return session.feedback_draft or ""


def set_feedback_draft(db: Session, session_id: str, content: str) -> str:
    session = get_session_or_404(db, session_id)
    text = content.strip() if content else ""
    if len(text) > FEEDBACK_MAX_CHARS:
        raise HTTPException(status_code=400, detail="Feedbacktekst is te lang")
    session.feedback_draft = text
    _touch(session)
    db.commit()
    return session.feedback_draft


def get_messages(db: Session, session_id: str, conversation_id: str) -> list[ConversationMessage]:
    get_conversation_or_404(db, session_id, conversation_id)
    return (
        db.query(ConversationMessage)
        .options(joinedload(ConversationMessage.citations))
        .filter(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc(), ConversationMessage.id.asc())
        .all()
    )


def truncate_messages_from(
    db: Session, session_id: str, conversation_id: str, message_id: str
) -> list[ConversationMessage]:
    conversation = get_conversation_or_404(db, session_id, conversation_id)
    ordered = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation.id)
        .order_by(ConversationMessage.created_at.asc(), ConversationMessage.id.asc())
        .all()
    )
    cutoff_idx = next((idx for idx, m in enumerate(ordered) if m.id == message_id), None)
    if cutoff_idx is None:
        raise HTTPException(status_code=404, detail="Message not found")
    for msg in ordered[cutoff_idx:]:
        db.delete(msg)
    conversation.updated_at = datetime.now(timezone.utc)
    _touch(conversation.session)
    db.commit()
    return get_messages(db, session_id, conversation_id)


def delete_session(db: Session, session_id: str) -> None:
    session = get_session_or_404(db, session_id)
    db.delete(session)
    db.commit()


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
