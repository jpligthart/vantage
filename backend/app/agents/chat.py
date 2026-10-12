import json
import logging
from collections.abc import AsyncIterator

import httpx
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy.orm import Session

from app.agents.citations import CitationStreamFilter, build_citation_items
from app.agents.prompts import BASE_SYSTEM_PROMPT, MODE_PROMPTS
from app.agents.tokens import count_tokens, fits_context
from app.core.config import get_settings
from app.documents.service import chunk_bbox, get_chunks_for_document
from app.models.entities import (
    AnalysisSession,
    ChatMode,
    Citation,
    ConversationMessage,
    Document,
    MessageRole,
    SessionSource,
    Source,
    SourceStatus,
)

logger = logging.getLogger(__name__)


def _session_single_source(db: Session, session_id: str) -> tuple[Source, Document]:
    links = db.query(SessionSource).filter(SessionSource.session_id == session_id).all()
    if len(links) != 1:
        raise ValueError("unsupported_source_count")
    source = db.get(Source, links[0].source_id)
    if source is None:
        raise ValueError("source_not_found")
    if source.status != SourceStatus.ready:
        raise ValueError("source_not_ready")
    doc = db.query(Document).filter(Document.source_id == source.id).first()
    if doc is None:
        raise ValueError("document_not_found")
    return source, doc


def build_document_context(chunks: list) -> tuple[str, dict[int, object]]:
    lines: list[str] = []
    index_map: dict[int, object] = {}
    for chunk in chunks:
        label = f"C{chunk.prompt_index}"
        index_map[chunk.prompt_index] = chunk
        lines.append(f"[{label}] {chunk.content}")
    return "\n\n".join(lines), index_map


def _history_text(messages: list[ConversationMessage], budget_tokens: int) -> str:
    parts: list[str] = []
    used = 0
    for msg in reversed(messages):
        line = f"{msg.role.value}: {msg.content}\n"
        t = count_tokens(line)
        if used + t > budget_tokens:
            break
        parts.insert(0, line)
        used += t
    return "".join(parts)


async def stream_chat(
    db: Session,
    session: AnalysisSession,
    user_content: str,
    mode: ChatMode,
    model_name: str,
    selection: str | None,
) -> AsyncIterator[tuple[str, dict]]:
    settings = get_settings()
    try:
        source, document = _session_single_source(db, session.id)
    except ValueError as exc:
        yield ("error", {"code": str(exc), "message": _error_message(str(exc))})
        return

    chunks = get_chunks_for_document(db, document.id)
    doc_text, index_map = build_document_context(chunks)
    mode_prompt = MODE_PROMPTS.get(mode.value, MODE_PROMPTS["spar"])
    system = f"{BASE_SYSTEM_PROMPT}\n\n{mode_prompt}"
    if selection:
        system += f"\n\nDe gebruiker heeft deze passage geselecteerd om te bespreken:\n{selection}"

    prior = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.session_id == session.id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
    model_ctx = await _get_context_len(model_name)
    ok, remaining = fits_context(
        system=system,
        document=doc_text,
        history="",
        user_message=user_content,
        model_context=model_ctx,
    )
    history_budget = max(0, remaining // 2)
    history = _history_text(prior, history_budget)
    ok, _ = fits_context(
        system=system,
        document=doc_text,
        history=history,
        user_message=user_content,
        model_context=model_ctx,
    )
    if not ok:
        yield (
            "error",
            {
                "code": "document_too_large",
                "message": (
                    "Het document past niet in het contextvenster van dit model. "
                    "Kies een model met een groter contextvenster."
                ),
            },
        )
        return

    user_msg = ConversationMessage(
        session_id=session.id,
        role=MessageRole.user,
        content=user_content,
        mode=mode,
    )
    db.add(user_msg)
    db.commit()

    yield ("context", {"strategy": "full_document"})

    prompt = (
        f"DOCUMENTCONTEXT:\n{doc_text}\n\n"
        f"GESPREK:\n{history}\n"
        f"GEBRUIKER: {user_content}"
    )

    full_response = ""
    stream_filter = CitationStreamFilter()

    try:
        provider = OpenAIProvider(base_url=settings.ollama_base_url, api_key="ollama")
        model = OpenAIChatModel(model_name, provider=provider)
        agent = Agent(model, system_prompt=system)

        async with agent.run_stream(prompt) as result:
            async for text in result.stream_text(delta=True):
                full_response += text
                cleaned = stream_filter.feed(text)
                if cleaned:
                    yield ("token", {"text": cleaned})
        tail = stream_filter.flush()
        if tail:
            yield ("token", {"text": tail})
    except httpx.HTTPError as exc:
        logger.exception("Ollama unavailable")
        yield (
            "error",
            {"code": "ollama_unavailable", "message": f"Ollama niet bereikbaar: {exc}"},
        )
        return
    except Exception as exc:
        logger.exception("Chat failed")
        yield ("error", {"code": "chat_failed", "message": str(exc)[:500]})
        return

    from app.agents.citations import strip_markers_from_stream

    citation_items = build_citation_items(
        full_response,
        index_map,
        source.id,
        source.name,
        chunk_bbox,
    )
    display_text = strip_markers_from_stream(full_response)

    assistant = ConversationMessage(
        session_id=session.id,
        role=MessageRole.assistant,
        content=display_text,
        mode=mode,
        context_strategy="full_document",
    )
    db.add(assistant)
    db.flush()

    for item in citation_items:
        db.add(
            Citation(
                message_id=assistant.id,
                source_id=item.source_id,
                chunk_id=item.chunk_id,
                page_no=item.page_no,
                section_title=item.section_title,
                excerpt=item.excerpt,
                bbox_json=json.dumps(item.bbox) if item.bbox else None,
            )
        )
    db.commit()

    yield (
        "citations",
        {
            "items": [
                {
                    "chunkId": c.chunk_id,
                    "sourceId": c.source_id,
                    "documentName": c.document_name,
                    "pageNo": c.page_no,
                    "sectionTitle": c.section_title,
                    "excerpt": c.excerpt,
                    "bbox": c.bbox,
                    "anchorId": c.anchor_id,
                }
                for c in citation_items
            ]
        },
    )
    yield ("done", {"messageId": assistant.id})


async def _get_context_len(model_name: str) -> int | None:
    from app.agents.ollama_client import get_model_context_length

    return await get_model_context_length(model_name)


def _error_message(code: str) -> str:
    messages = {
        "unsupported_source_count": "Deze sessie moet precies één bron bevatten.",
        "source_not_found": "Bron niet gevonden.",
        "source_not_ready": "Het document wordt nog verwerkt of is mislukt.",
        "document_not_found": "Document niet gevonden.",
    }
    return messages.get(code, "Onbekende fout.")
