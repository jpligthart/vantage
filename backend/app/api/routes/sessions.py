import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.agents.chat import stream_chat
from app.api.schemas import ChatRequest, SessionCreate, SessionSourceAttach
from app.core.database import get_db
from app.models.entities import ChatMode, SourceChunk
from app.sessions.service import (
    attach_source,
    create_session,
    delete_session,
    get_messages,
    get_session_or_404,
    list_sessions,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _citation_payload(db: Session, c) -> dict:
    chunk = db.get(SourceChunk, c.chunk_id)
    return {
        "chunkId": c.chunk_id,
        "sourceId": c.source_id,
        "pageNo": c.page_no,
        "sectionTitle": c.section_title,
        "excerpt": c.excerpt,
        "bbox": json.loads(c.bbox_json) if c.bbox_json else None,
        "anchorId": chunk.anchor_id if chunk else None,
    }


@router.post("")
def post_session(body: SessionCreate, db: Session = Depends(get_db)) -> dict:
    session = create_session(db, body.title, body.preferredModel)
    return {
        "id": session.id,
        "title": session.title,
        "preferredModel": session.preferred_model,
        "createdAt": session.created_at.isoformat(),
    }


@router.get("")
def get_sessions(db: Session = Depends(get_db)) -> dict:
    sessions = list_sessions(db)
    return {
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "preferredModel": s.preferred_model,
                "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    session = get_session_or_404(db, session_id)
    from app.models.entities import SessionSource

    links = db.query(SessionSource).filter(SessionSource.session_id == session.id).all()
    return {
        "id": session.id,
        "title": session.title,
        "preferredModel": session.preferred_model,
        "sourceIds": [l.source_id for l in links],
    }


@router.post("/{session_id}/sources")
def post_session_source(
    session_id: str, body: SessionSourceAttach, db: Session = Depends(get_db)
) -> dict:
    attach_source(db, session_id, body.sourceId)
    return {"attached": True}


@router.delete("/{session_id}")
def remove_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    delete_session(db, session_id)
    return {"deleted": True}


@router.get("/{session_id}/messages")
def session_messages(session_id: str, db: Session = Depends(get_db)) -> dict:
    messages = get_messages(db, session_id)
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role.value,
                "content": m.content,
                "mode": m.mode.value if m.mode else None,
                "contextStrategy": m.context_strategy,
                "createdAt": m.created_at.isoformat(),
                "citations": [_citation_payload(db, c) for c in m.citations],
            }
            for m in messages
        ]
    }


@router.post("/{session_id}/chat")
async def session_chat(
    session_id: str, body: ChatRequest, db: Session = Depends(get_db)
) -> StreamingResponse:
    session = get_session_or_404(db, session_id)
    try:
        mode = ChatMode(body.mode)
    except ValueError:
        mode = ChatMode.spar

    selection = body.selection
    if body.chunkId and not selection:
        from app.documents.service import get_source_or_404
        from app.models.entities import Document, SessionSource, SourceChunk

        link = (
            db.query(SessionSource).filter(SessionSource.session_id == session_id).first()
        )
        if link:
            chunk = db.get(SourceChunk, body.chunkId)
            if chunk:
                selection = chunk.content[:2000]

    async def event_generator():
        async for event_type, payload in stream_chat(
            db, session, body.message, mode, body.model, selection
        ):
            yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
