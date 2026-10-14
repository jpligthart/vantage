import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone

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
    Conversation,
    ConversationMessage,
    ConversationSource,
    Document,
    MessageRole,
    Source,
    SourceChunk,
    SourceStatus,
)
from app.sessions.service import get_session_memory, session_sources

logger = logging.getLogger(__name__)


class CitedChunk:
    """Chunk plus the source it came from, so markers stay unique across documents."""

    def __init__(self, chunk: SourceChunk, source_id: str, document_name: str) -> None:
        self.id = chunk.id
        self.content = chunk.content
        self.page_no = chunk.page_no
        self.section_title = chunk.section_title
        self.anchor_id = chunk.anchor_id
        self.prompt_index = chunk.prompt_index
        self.source_id = source_id
        self.document_name = document_name


def context_sources(db: Session, session: AnalysisSession, conversation: Conversation) -> list[Source]:
    sources = session_sources(db, session.id)
    pins = (
        db.query(ConversationSource.source_id)
        .filter(ConversationSource.conversation_id == conversation.id)
        .all()
    )
    if not pins:
        return sources
    allowed = {row[0] for row in pins}
    return [source for source in sources if source.id in allowed]


def build_multi_document_context(
    documents: list[tuple[Source, list[SourceChunk]]],
) -> tuple[str, dict[str, CitedChunk], list[dict]]:
    blocks: list[str] = []
    index_map: dict[str, CitedChunk] = {}
    sizes: list[dict] = []
    for doc_index, (source, chunks) in enumerate(documents, start=1):
        lines = [f"## D{doc_index}: {source.name}"]
        for chunk in chunks:
            label = f"D{doc_index}C{chunk.prompt_index}"
            cited = CitedChunk(chunk, source.id, source.name)
            index_map[label] = cited
            lines.append(f"[{label}] {chunk.content}")
        text = "\n\n".join(lines)
        sizes.append(
            {"sourceId": source.id, "name": source.name, "tokens": count_tokens(text)}
        )
        blocks.append(text)
    return "\n\n".join(blocks), index_map, sizes


def _ready_documents(
    db: Session, sources: list[Source]
) -> tuple[list[tuple[Source, Document]], str | None]:
    if not sources:
        return [], "no_sources"
    ready: list[tuple[Source, Document]] = []
    saw_not_ready = False
    for source in sources:
        if source.status != SourceStatus.ready:
            saw_not_ready = True
            continue
        doc = db.query(Document).filter(Document.source_id == source.id).first()
        if doc is None:
            return [], "document_not_found"
        ready.append((source, doc))
    if not ready:
        return [], "source_not_ready" if saw_not_ready else "document_not_found"
    return ready, None


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
    conversation: Conversation,
    user_content: str,
    mode: ChatMode,
    model_name: str,
    selection: str | None,
) -> AsyncIterator[tuple[str, dict]]:
    settings = get_settings()
    selected = context_sources(db, session, conversation)
    ready, error_code = _ready_documents(db, selected)
    if error_code:
        yield ("error", {"code": error_code, "message": _error_message(error_code)})
        return

    documents = [
        (source, get_chunks_for_document(db, document.id)) for source, document in ready
    ]
    doc_text, index_map, sizes = build_multi_document_context(documents)
    memory = get_session_memory(db, session.id).strip()
    memory_block = f"SESSIEGEHEUGEN:\n{memory}\n\n" if memory else ""
    document_for_budget = f"{doc_text}\n\n{memory_block}".strip()

    skipped = [source.name for source in selected if source.status != SourceStatus.ready]
    mode_prompt = MODE_PROMPTS.get(mode.value, MODE_PROMPTS["spar"])
    system = f"{BASE_SYSTEM_PROMPT}\n\n{mode_prompt}"
    if skipped:
        system += (
            "\n\nDeze bronnen zijn aangevinkt maar nog niet beschikbaar, neem ze niet mee: "
            + ", ".join(skipped)
        )
    if selection:
        system += f"\n\nDe gebruiker heeft deze passage geselecteerd om te bespreken:\n{selection}"

    prior = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation.id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
    model_ctx = await _get_context_len(model_name)
    ok, remaining = fits_context(
        system=system,
        document=document_for_budget,
        history="",
        user_message=user_content,
        model_context=model_ctx,
    )
    history_budget = max(0, remaining // 2)
    history = _history_text(prior, history_budget)
    ok, _ = fits_context(
        system=system,
        document=document_for_budget,
        history=history,
        user_message=user_content,
        model_context=model_ctx,
    )
    if not ok:
        yield (
            "error",
            {
                "code": "document_too_large",
                "message": _too_large_message(sizes),
                "sources": sizes,
            },
        )
        return

    now = datetime.now(timezone.utc)
    user_msg = ConversationMessage(
        conversation_id=conversation.id,
        role=MessageRole.user,
        content=user_content,
        mode=mode,
    )
    db.add(user_msg)
    session.updated_at = now
    conversation.updated_at = now
    db.commit()

    yield (
        "context",
        {
            "strategy": "full_document",
            "sourceCount": len(documents),
            "sources": sizes,
            "skipped": skipped,
        },
    )

    prompt = (
        f"DOCUMENTCONTEXT:\n{doc_text}\n\n"
        f"{memory_block}"
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

    first_source = documents[0][0]
    citation_items = build_citation_items(
        full_response,
        index_map,
        first_source.id,
        first_source.name,
        chunk_bbox,
    )
    display_text = strip_markers_from_stream(full_response)

    assistant = ConversationMessage(
        conversation_id=conversation.id,
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
                    "promptIndex": c.prompt_index,
                }
                for c in citation_items
            ]
        },
    )
    yield ("done", {"messageId": assistant.id})


async def _get_context_len(model_name: str) -> int | None:
    from app.agents.ollama_client import get_model_context_length

    return await get_model_context_length(model_name)


def _too_large_message(sizes: list[dict]) -> str:
    lines = "\n".join(f"- {item['name']}: {item['tokens']} tokens" for item in sizes)
    return (
        "De aangevinkte documenten passen niet in het contextvenster van dit model.\n"
        f"{lines}\n"
        "Zet een document uit voor dit gesprek, of kies een model met een groter contextvenster."
    )


def _error_message(code: str) -> str:
    messages = {
        "no_sources": "Deze sessie heeft nog geen bronnen.",
        "source_not_found": "Bron niet gevonden.",
        "source_not_ready": "Het document wordt nog verwerkt of is mislukt.",
        "document_not_found": "Document niet gevonden.",
    }
    return messages.get(code, "Onbekende fout.")
