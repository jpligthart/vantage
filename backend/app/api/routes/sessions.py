import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.agents.citations import sort_citation_payloads
from app.agents.chat import stream_chat, stream_feedback
from app.api.schemas import (
    ChatRequest,
    ConversationCreate,
    ConversationSourcesUpdate,
    ConversationUpdate,
    FeedbackDraftUpdate,
    FeedbackGenerateRequest,
    SessionCreate,
    SessionMemoryAppend,
    SessionMemoryUpdate,
    SessionSourceAttach,
    SessionUpdate,
)
from app.core.database import get_db
from app.documents.service import source_to_dict
from app.models.entities import ChatMode, Document, Source, SourceChunk
from app.sessions.service import (
    append_session_memory,
    attach_source,
    conversation_source_ids,
    create_conversation,
    create_session,
    delete_conversation,
    delete_session,
    detach_source,
    get_conversation_or_404,
    get_feedback_draft,
    get_messages,
    get_session_memory,
    get_session_or_404,
    list_conversations,
    list_sessions,
    rename_conversation,
    session_sources,
    set_conversation_sources,
    set_feedback_draft,
    set_session_memory,
    truncate_messages_from,
    update_session,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _citation_payload(db: Session, c) -> dict:
    chunk = db.get(SourceChunk, c.chunk_id)
    source = db.get(Source, c.source_id) if c.source_id else None
    return {
        "chunkId": c.chunk_id,
        "sourceId": c.source_id,
        "documentName": source.name if source else None,
        "pageNo": c.page_no,
        "sectionTitle": c.section_title,
        "excerpt": c.excerpt,
        "bbox": json.loads(c.bbox_json) if c.bbox_json else None,
        "anchorId": chunk.anchor_id if chunk else None,
        "promptIndex": chunk.prompt_index if chunk else None,
    }


def _conversation_payload(db: Session, conversation) -> dict:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "updatedAt": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "sourceIds": conversation_source_ids(db, conversation.id),
        "feedbackDraft": conversation.feedback_draft or "",
    }


def _session_payload(db: Session, session, *, include_sources: bool) -> dict:
    conversations = list_conversations(db, session.id)
    payload = {
        "id": session.id,
        "title": session.title,
        "preferredModel": session.preferred_model,
        "student": session.student,
        "subject": session.subject,
        "createdAt": session.created_at.isoformat() if session.created_at else None,
        "updatedAt": session.updated_at.isoformat() if session.updated_at else None,
        "memory": get_session_memory(db, session.id) if include_sources else None,
        "feedbackDraft": get_feedback_draft(db, session.id) if include_sources else None,
        "conversations": [_conversation_payload(db, conversation) for conversation in conversations],
    }
    if include_sources:
        payload["sources"] = [source_to_dict(source) for source in session_sources(db, session.id)]
    return payload


@router.post("")
def post_session(body: SessionCreate, db: Session = Depends(get_db)) -> dict:
    session = create_session(db, body.title, body.preferredModel, body.student, body.subject)
    return _session_payload(db, session, include_sources=True)


@router.get("")
def get_sessions(db: Session = Depends(get_db)) -> dict:
    sessions = list_sessions(db)
    return {"sessions": [_session_payload(db, session, include_sources=False) for session in sessions]}


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    session = get_session_or_404(db, session_id)
    return _session_payload(db, session, include_sources=True)


@router.patch("/{session_id}")
def patch_session(session_id: str, body: SessionUpdate, db: Session = Depends(get_db)) -> dict:
    fields = body.model_fields_set
    session = update_session(
        db,
        session_id,
        title=body.title,
        preferred_model=body.preferredModel,
        student=body.student,
        subject=body.subject,
        student_set="student" in fields,
        subject_set="subject" in fields,
    )
    return _session_payload(db, session, include_sources=True)


@router.post("/{session_id}/sources")
def post_session_source(
    session_id: str, body: SessionSourceAttach, db: Session = Depends(get_db)
) -> dict:
    attach_source(db, session_id, body.sourceId)
    return {"attached": True}


@router.delete("/{session_id}/sources/{source_id}")
def remove_session_source(session_id: str, source_id: str, db: Session = Depends(get_db)) -> dict:
    detach_source(db, session_id, source_id)
    return {"detached": True}


@router.delete("/{session_id}")
def remove_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    delete_session(db, session_id)
    return {"deleted": True}


@router.get("/{session_id}/conversations")
def get_conversations(session_id: str, db: Session = Depends(get_db)) -> dict:
    conversations = list_conversations(db, session_id)
    return {"conversations": [_conversation_payload(db, conversation) for conversation in conversations]}


@router.post("/{session_id}/conversations")
def post_conversation(
    session_id: str, body: ConversationCreate, db: Session = Depends(get_db)
) -> dict:
    conversation = create_conversation(db, session_id, body.title)
    return _conversation_payload(db, conversation)


@router.patch("/{session_id}/conversations/{conversation_id}")
def patch_conversation(
    session_id: str,
    conversation_id: str,
    body: ConversationUpdate,
    db: Session = Depends(get_db),
) -> dict:
    conversation = rename_conversation(db, session_id, conversation_id, body.title)
    return _conversation_payload(db, conversation)


@router.delete("/{session_id}/conversations/{conversation_id}")
def remove_conversation(session_id: str, conversation_id: str, db: Session = Depends(get_db)) -> dict:
    delete_conversation(db, session_id, conversation_id)
    return {"deleted": True}


@router.put("/{session_id}/conversations/{conversation_id}/sources")
def put_conversation_sources(
    session_id: str,
    conversation_id: str,
    body: ConversationSourcesUpdate,
    db: Session = Depends(get_db),
) -> dict:
    source_ids = set_conversation_sources(db, session_id, conversation_id, body.sourceIds)
    return {"sourceIds": source_ids}


@router.get("/{session_id}/memory")
def get_memory(session_id: str, db: Session = Depends(get_db)) -> dict:
    return {"content": get_session_memory(db, session_id)}


@router.put("/{session_id}/memory")
def put_memory(session_id: str, body: SessionMemoryUpdate, db: Session = Depends(get_db)) -> dict:
    return {"content": set_session_memory(db, session_id, body.content)}


@router.post("/{session_id}/memory")
def post_memory(session_id: str, body: SessionMemoryAppend, db: Session = Depends(get_db)) -> dict:
    return {"content": append_session_memory(db, session_id, body.content)}


@router.get("/{session_id}/feedback")
def get_feedback(session_id: str, db: Session = Depends(get_db)) -> dict:
    return {"content": get_feedback_draft(db, session_id)}


@router.put("/{session_id}/feedback")
def put_feedback(session_id: str, body: FeedbackDraftUpdate, db: Session = Depends(get_db)) -> dict:
    return {"content": set_feedback_draft(db, session_id, body.content)}


@router.get("/{session_id}/conversations/{conversation_id}/feedback")
def get_conversation_feedback(
    session_id: str, conversation_id: str, db: Session = Depends(get_db)
) -> dict:
    return {"content": get_feedback_draft(db, session_id, conversation_id)}


@router.put("/{session_id}/conversations/{conversation_id}/feedback")
def put_conversation_feedback(
    session_id: str,
    conversation_id: str,
    body: FeedbackDraftUpdate,
    db: Session = Depends(get_db),
) -> dict:
    return {"content": set_feedback_draft(db, session_id, body.content, conversation_id)}


@router.post("/{session_id}/conversations/{conversation_id}/feedback/generate")
async def generate_conversation_feedback(
    session_id: str,
    conversation_id: str,
    body: FeedbackGenerateRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    session = get_session_or_404(db, session_id)
    conversation = get_conversation_or_404(db, session_id, conversation_id)

    async def event_generator():
        async for event_type, payload in stream_feedback(
            db,
            session,
            body.action,
            body.model,
            body.draft,
            instructions=body.instructions,
            selection=body.selection,
            conversation=conversation,
            source_ids=body.sourceIds,
        ):
            yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{session_id}/feedback/generate")
async def generate_feedback(
    session_id: str,
    body: FeedbackGenerateRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    session = get_session_or_404(db, session_id)
    conversation = (
        get_conversation_or_404(db, session_id, body.conversationId)
        if body.conversationId
        else None
    )

    async def event_generator():
        async for event_type, payload in stream_feedback(
            db,
            session,
            body.action,
            body.model,
            body.draft,
            instructions=body.instructions,
            selection=body.selection,
            conversation=conversation,
            source_ids=body.sourceIds,
        ):
            yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{session_id}/conversations/{conversation_id}/messages")
def conversation_messages(
    session_id: str, conversation_id: str, db: Session = Depends(get_db)
) -> dict:
    messages = get_messages(db, session_id, conversation_id)
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role.value,
                "content": m.content,
                "mode": m.mode.value if m.mode else None,
                "contextStrategy": m.context_strategy,
                "createdAt": m.created_at.isoformat(),
                "citations": sort_citation_payloads(
                    [_citation_payload(db, c) for c in m.citations]
                ),
            }
            for m in messages
        ]
    }


@router.delete("/{session_id}/conversations/{conversation_id}/messages/{message_id}")
def delete_messages_from(
    session_id: str,
    conversation_id: str,
    message_id: str,
    db: Session = Depends(get_db),
) -> dict:
    messages = truncate_messages_from(db, session_id, conversation_id, message_id)
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role.value,
                "content": m.content,
                "mode": m.mode.value if m.mode else None,
                "contextStrategy": m.context_strategy,
                "createdAt": m.created_at.isoformat(),
                "citations": sort_citation_payloads(
                    [_citation_payload(db, c) for c in m.citations]
                ),
            }
            for m in messages
        ]
    }


@router.post("/{session_id}/conversations/{conversation_id}/chat")
async def conversation_chat(
    session_id: str,
    conversation_id: str,
    body: ChatRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    session = get_session_or_404(db, session_id)
    conversation = get_conversation_or_404(db, session_id, conversation_id)
    try:
        mode = ChatMode(body.mode)
    except ValueError:
        mode = ChatMode.spar

    selection = body.selection
    if body.chunkId and not selection:
        chunk = db.get(SourceChunk, body.chunkId)
        document = db.get(Document, chunk.document_id) if chunk else None
        attached = {source.id for source in session_sources(db, session_id)}
        if chunk and document and document.source_id in attached:
            selection = chunk.content[:2000]

    async def event_generator():
        async for event_type, payload in stream_chat(
            db, session, conversation, body.message, mode, body.model, selection
        ):
            yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
