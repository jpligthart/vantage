from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.entities import AnalysisSession, ConversationMessage, SessionSource


def list_sessions(db: Session) -> list[AnalysisSession]:
    return db.query(AnalysisSession).order_by(AnalysisSession.updated_at.desc()).all()


def create_session(db: Session, title: str, preferred_model: str | None = None) -> AnalysisSession:
    session = AnalysisSession(title=title, preferred_model=preferred_model)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session_or_404(db: Session, session_id: str) -> AnalysisSession:
    session = db.get(AnalysisSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def attach_source(db: Session, session_id: str, source_id: str) -> None:
    session = get_session_or_404(db, session_id)
    existing = (
        db.query(SessionSource).filter(SessionSource.session_id == session.id).count()
    )
    if existing >= 1:
        raise HTTPException(status_code=400, detail="Phase 1 supports one source per session")
    link = SessionSource(session_id=session.id, source_id=source_id)
    db.add(link)
    db.commit()


def delete_session(db: Session, session_id: str) -> None:
    session = get_session_or_404(db, session_id)
    db.delete(session)
    db.commit()


def get_messages(db: Session, session_id: str) -> list[ConversationMessage]:
    get_session_or_404(db, session_id)
    return (
        db.query(ConversationMessage)
        .options(joinedload(ConversationMessage.citations))
        .filter(ConversationMessage.session_id == session_id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
