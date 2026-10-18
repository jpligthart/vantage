import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.agents.citations import CitationStreamFilter, build_citation_items, strip_markers_from_stream
from app.agents.prompts import (
    BASE_SYSTEM_PROMPT,
    FEEDBACK_ACTION_PROMPTS,
    FEEDBACK_SYSTEM_PROMPT,
    MODE_PROMPTS,
    RETRIEVED_REFERENCES_NOTE,
)
from app.agents.tokens import count_tokens, fits_context
from app.core.config import get_settings
from app.documents.fts import fallback_leading_chunks, search_chunks
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
from app.sessions.service import get_session_memory, session_sources, set_feedback_draft

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
    student_docs = [(s, c) for s, c in documents if not getattr(s, "is_reference", False)]
    ref_docs = [(s, c) for s, c in documents if getattr(s, "is_reference", False)]

    index_map: dict[str, CitedChunk] = {}
    sizes: list[dict] = []
    sections: list[str] = []

    def _render_group(
        group: list[tuple[Source, list[SourceChunk]]], prefix: str
    ) -> list[str]:
        blocks: list[str] = []
        for idx, (source, chunks) in enumerate(group, start=1):
            if not chunks:
                continue
            lines = [f"## {prefix}{idx}: {source.name}"]
            for chunk in chunks:
                label = f"{prefix}{idx}C{chunk.prompt_index}"
                cited = CitedChunk(chunk, source.id, source.name)
                index_map[label] = cited
                lines.append(f"[{label}] {chunk.content}")
            text = "\n\n".join(lines)
            sizes.append(
                {
                    "sourceId": source.id,
                    "name": source.name,
                    "tokens": count_tokens(text),
                    "isReference": bool(getattr(source, "is_reference", False)),
                }
            )
            blocks.append(text)
        return blocks

    student_blocks = _render_group(student_docs, "D")
    ref_blocks = _render_group(ref_docs, "R")

    if student_blocks and ref_blocks:
        sections.append("STUDENTENWERK:\n" + "\n\n".join(student_blocks))
        sections.append("KADERS EN RICHTLIJNEN:\n" + "\n\n".join(ref_blocks))
    elif student_blocks:
        sections.append("\n\n".join(student_blocks))
    elif ref_blocks:
        sections.append("KADERS EN RICHTLIJNEN:\n" + "\n\n".join(ref_blocks))

    return "\n\n".join(sections), index_map, sizes


def _document_ids_for_sources(
    documents: list[tuple[Source, list[SourceChunk]]],
) -> list[str]:
    ids: list[str] = []
    for _, chunks in documents:
        if chunks:
            ids.append(chunks[0].document_id)
    return ids


def _select_reference_chunks(
    db: Session,
    ref_docs: list[tuple[Source, list[SourceChunk]]],
    search_query: str,
    *,
    token_budget: int,
) -> list[tuple[Source, list[SourceChunk]]]:
    """Pick FTS (or fallback) chunks for references within a token budget."""
    settings = get_settings()
    ref_doc_ids = _document_ids_for_sources(ref_docs)
    if not ref_doc_ids:
        return []

    hits = search_chunks(
        db,
        ref_doc_ids,
        search_query,
        limit=settings.fts_chunk_limit,
        min_query_chars=settings.fts_min_query_chars,
    )
    if not hits:
        hits = fallback_leading_chunks(
            db,
            ref_doc_ids,
            per_document=settings.fts_fallback_per_document,
            limit=settings.fts_chunk_limit,
        )

    by_doc: dict[str, list[SourceChunk]] = {}
    used_tokens = 0
    for chunk in hits:
        t = count_tokens(chunk.content)
        if used_tokens + t > token_budget and by_doc:
            break
        by_doc.setdefault(chunk.document_id, []).append(chunk)
        used_tokens += t

    selected: list[tuple[Source, list[SourceChunk]]] = []
    for source, chunks in ref_docs:
        if not chunks:
            continue
        doc_id = chunks[0].document_id
        picked = by_doc.get(doc_id, [])
        if not picked:
            continue
        picked_sorted = sorted(picked, key=lambda c: c.prompt_index)
        selected.append((source, picked_sorted))
    return selected


def resolve_document_context(
    db: Session,
    documents: list[tuple[Source, list[SourceChunk]]],
    *,
    system: str,
    user_message: str,
    memory_block: str,
    model_context: int | None,
    search_query: str,
) -> tuple[str, dict[str, CitedChunk], list[dict], str, str | None]:
    """
    Choose full_document vs retrieved_references for oversized kaders.

    Returns (doc_text, index_map, sizes, strategy, error_code).
    """
    full_text, full_map, full_sizes = build_multi_document_context(documents)
    document_for_budget = f"{full_text}\n\n{memory_block}".strip()
    ok, _ = fits_context(
        system=system,
        document=document_for_budget,
        history="",
        user_message=user_message,
        model_context=model_context,
    )
    if ok:
        return full_text, full_map, full_sizes, "full_document", None

    student_docs = [(s, c) for s, c in documents if not getattr(s, "is_reference", False)]
    ref_docs = [(s, c) for s, c in documents if getattr(s, "is_reference", False)]

    if not ref_docs:
        return full_text, full_map, full_sizes, "full_document", "document_too_large"

    student_text, student_map, student_sizes = build_multi_document_context(student_docs)
    student_budget_doc = f"{student_text}\n\n{memory_block}".strip()
    student_ok, remaining = fits_context(
        system=system,
        document=student_budget_doc,
        history="",
        user_message=user_message,
        model_context=model_context,
    )
    if not student_ok:
        return full_text, full_map, full_sizes, "full_document", "document_too_large"

    # Half of remaining room is reserved for chat history in the caller.
    ref_token_budget = max(256, remaining // 2)
    selected_refs = _select_reference_chunks(
        db,
        ref_docs,
        search_query,
        token_budget=ref_token_budget,
    )
    hybrid_docs = list(student_docs) + selected_refs
    hybrid_text, hybrid_map, hybrid_sizes = build_multi_document_context(hybrid_docs)
    for item in hybrid_sizes:
        if item.get("isReference"):
            item["retrieved"] = True

    hybrid_budget = f"{hybrid_text}\n\n{memory_block}".strip()
    hybrid_ok, _ = fits_context(
        system=system,
        document=hybrid_budget,
        history="",
        user_message=user_message,
        model_context=model_context,
    )
    if not hybrid_ok:
        # Extreme edge case: even trimmed refs overflow — drop refs, keep student.
        if student_docs:
            return student_text, student_map, student_sizes, "retrieved_references", None
        return full_text, full_map, full_sizes, "full_document", "document_too_large"

    return hybrid_text, hybrid_map, hybrid_sizes, "retrieved_references", None


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


async def _stream_ollama_tokens(
    *,
    ollama_host: str,
    model_name: str,
    system: str,
    prompt: str,
    timeout_seconds: int,
) -> AsyncIterator[str]:
    timeout = httpx.Timeout(
        connect=15.0,
        read=float(max(timeout_seconds, 120)),
        write=30.0,
        pool=15.0,
    )
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{ollama_host.rstrip('/')}/api/chat",
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for raw_line in resp.aiter_lines():
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if item.get("error"):
                    raise RuntimeError(str(item["error"]))
                piece = (item.get("message") or {}).get("content") or ""
                if piece:
                    yield piece
                if item.get("done") is True:
                    return


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
    memory = get_session_memory(db, session.id).strip()
    memory_block = f"SESSIEGEHEUGEN:\n{memory}\n\n" if memory else ""

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

    search_parts = [user_content]
    if selection and selection.strip():
        search_parts.append(selection.strip())
    search_query = "\n".join(search_parts)

    prior = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation.id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
    model_ctx = await _get_context_len(model_name)
    doc_text, index_map, sizes, strategy, resolve_error = resolve_document_context(
        db,
        documents,
        system=system,
        user_message=user_content,
        memory_block=memory_block,
        model_context=model_ctx,
        search_query=search_query,
    )
    if resolve_error:
        yield (
            "error",
            {
                "code": resolve_error,
                "message": _too_large_message(sizes),
                "sources": sizes,
            },
        )
        return

    if strategy == "retrieved_references":
        system = f"{system}\n\n{RETRIEVED_REFERENCES_NOTE}"

    document_for_budget = f"{doc_text}\n\n{memory_block}".strip()
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
            "strategy": strategy,
            "sourceCount": len(sizes),
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
    first_source = documents[0][0]
    assistant: ConversationMessage | None = None

    def _persist_progress() -> None:
        nonlocal assistant
        display_text = strip_markers_from_stream(full_response)
        if not display_text.strip():
            return
        if assistant is None:
            assistant = ConversationMessage(
                conversation_id=conversation.id,
                role=MessageRole.assistant,
                content=display_text,
                mode=mode,
                context_strategy=strategy,
            )
            db.add(assistant)
            db.flush()
        else:
            assistant.content = display_text
        db.commit()

    def _finalize_assistant() -> list:
        nonlocal assistant
        display_text = strip_markers_from_stream(full_response)
        if not display_text.strip():
            return []
        citation_items = build_citation_items(
            full_response,
            index_map,
            first_source.id,
            first_source.name,
            chunk_bbox,
        )
        if assistant is None:
            assistant = ConversationMessage(
                conversation_id=conversation.id,
                role=MessageRole.assistant,
                content=display_text,
                mode=mode,
                context_strategy=strategy,
            )
            db.add(assistant)
            db.flush()
        else:
            assistant.content = display_text
            db.query(Citation).filter(Citation.message_id == assistant.id).delete()

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
        return citation_items

    last_saved_len = 0

    try:
        async for text in _stream_ollama_tokens(
            ollama_host=settings.ollama_host,
            model_name=model_name,
            system=system,
            prompt=prompt,
            timeout_seconds=settings.chat_timeout_seconds,
        ):
            full_response += text
            cleaned = stream_filter.feed(text)
            if cleaned:
                if assistant is None or len(full_response) - last_saved_len >= 120:
                    _persist_progress()
                    last_saved_len = len(full_response)
                yield ("token", {"text": cleaned})
        tail = stream_filter.flush()
        if tail:
            yield ("token", {"text": tail})
    except (GeneratorExit, BaseException) as exc:
        if full_response.strip():
            try:
                _finalize_assistant()
            except Exception:
                logger.exception("Failed to save partial assistant response")
        if isinstance(exc, httpx.HTTPError):
            logger.exception("Ollama unavailable")
            yield (
                "error",
                {"code": "ollama_unavailable", "message": f"Ollama niet bereikbaar: {exc}"},
            )
            return
        if isinstance(exc, Exception):
            logger.exception("Chat failed")
            yield ("error", {"code": "chat_failed", "message": str(exc)[:500]})
            return
        raise

    citation_items = _finalize_assistant()
    if assistant is None:
        yield ("done", {"messageId": None})
        return

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


async def stream_feedback(
    db: Session,
    session: AnalysisSession,
    action: str,
    model_name: str,
    draft: str,
    instructions: str | None = None,
    selection: str | None = None,
    conversation: Conversation | None = None,
    source_ids: list[str] | None = None,
) -> AsyncIterator[tuple[str, dict]]:
    settings = get_settings()
    if source_ids is not None:
        all_sources = session_sources(db, session.id)
        allowed = set(source_ids)
        selected = [s for s in all_sources if s.id in allowed]
    elif conversation is not None:
        selected = context_sources(db, session, conversation)
    else:
        selected = session_sources(db, session.id)

    ready, error_code = _ready_documents(db, selected)
    if error_code:
        yield ("error", {"code": error_code, "message": _error_message(error_code)})
        return

    documents = [
        (source, get_chunks_for_document(db, document.id)) for source, document in ready
    ]
    memory = get_session_memory(db, session.id).strip()
    memory_block = f"SESSIEGEHEUGEN:\n{memory}\n\n" if memory else ""

    action_key = action if action in FEEDBACK_ACTION_PROMPTS else "compose"
    action_prompt = FEEDBACK_ACTION_PROMPTS[action_key]

    if action_key in ("expand", "rewrite") and not (draft and draft.strip()):
        yield (
            "error",
            {
                "code": "empty_draft",
                "message": "Schrijf eerst steekwoorden of conceptfeedback in het tekstvak.",
            },
        )
        return

    system = f"{FEEDBACK_SYSTEM_PROMPT}\n\nOPDRACHT:\n{action_prompt}"
    if selection and selection.strip():
        system += f"\n\nGESELECTEERDE PASSAGE:\n{selection.strip()}"

    user_parts: list[str] = []
    if draft and draft.strip():
        label = (
            "STEEKWOORDEN / CONCEPT VAN DOCENT:"
            if action_key in ("expand", "rewrite")
            else "HUIDIGE CONCEPTFEEDBACK / AANTEKENINGEN:"
        )
        user_parts.append(f"{label}\n{draft.strip()}")
    if instructions and instructions.strip():
        user_parts.append(f"EXTRA INSTRUCTIE VAN DOCENT:\n{instructions.strip()}")
    if not user_parts:
        user_parts.append("Stel de conceptfeedback op.")
    user_message = "\n\n".join(user_parts)

    search_parts: list[str] = []
    if draft and draft.strip():
        search_parts.append(draft.strip())
    if instructions and instructions.strip():
        search_parts.append(instructions.strip())
    if selection and selection.strip():
        search_parts.append(selection.strip())
    search_query = "\n".join(search_parts)

    model_ctx = await _get_context_len(model_name)
    doc_text, index_map, sizes, strategy, resolve_error = resolve_document_context(
        db,
        documents,
        system=system,
        user_message=user_message,
        memory_block=memory_block,
        model_context=model_ctx,
        search_query=search_query,
    )
    if resolve_error:
        yield (
            "error",
            {
                "code": resolve_error,
                "message": _too_large_message(sizes),
                "sources": sizes,
            },
        )
        return

    if strategy == "retrieved_references":
        system = f"{system}\n\n{RETRIEVED_REFERENCES_NOTE}"

    document_for_budget = f"{doc_text}\n\n{memory_block}".strip()
    ok, remaining = fits_context(
        system=system,
        document=document_for_budget,
        history="",
        user_message=user_message,
        model_context=model_ctx,
    )
    history = ""
    if conversation is not None:
        prior = (
            db.query(ConversationMessage)
            .filter(ConversationMessage.conversation_id == conversation.id)
            .order_by(ConversationMessage.created_at.asc())
            .all()
        )
        history_budget = max(0, remaining // 2)
        history = _history_text(prior, history_budget)
    ok, _ = fits_context(
        system=system,
        document=document_for_budget,
        history=history,
        user_message=user_message,
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

    skipped = [source.name for source in selected if source.status != SourceStatus.ready]
    yield (
        "context",
        {
            "strategy": strategy,
            "sourceCount": len(sizes),
            "sources": sizes,
            "skipped": skipped,
        },
    )

    history_block = f"GESPREK:\n{history}\n" if history.strip() else ""
    prompt = (
        f"DOCUMENTCONTEXT:\n{doc_text}\n\n"
        f"{memory_block}"
        f"{history_block}"
        f"{user_message}"
    )

    full_response = ""
    stream_filter = CitationStreamFilter()
    last_saved_len = 0

    def _save_feedback_progress() -> str:
        display_text = strip_markers_from_stream(full_response).strip()
        if display_text:
            set_feedback_draft(
                db,
                session.id,
                display_text,
                conversation_id=conversation.id if conversation else None,
            )
        return display_text

    try:
        async for text in _stream_ollama_tokens(
            ollama_host=settings.ollama_host,
            model_name=model_name,
            system=system,
            prompt=prompt,
            timeout_seconds=settings.chat_timeout_seconds,
        ):
            full_response += text
            cleaned = stream_filter.feed(text)
            if cleaned:
                if last_saved_len == 0 or len(full_response) - last_saved_len >= 120:
                    _save_feedback_progress()
                    last_saved_len = len(full_response)
                yield ("token", {"text": cleaned})
        tail = stream_filter.flush()
        if tail:
            yield ("token", {"text": tail})
    except (GeneratorExit, BaseException) as exc:
        if full_response.strip():
            try:
                _save_feedback_progress()
            except Exception:
                logger.exception("Failed to save partial feedback draft")
        if isinstance(exc, httpx.HTTPError):
            logger.exception("Ollama unavailable")
            yield (
                "error",
                {"code": "ollama_unavailable", "message": f"Ollama niet bereikbaar: {exc}"},
            )
            return
        if isinstance(exc, Exception):
            logger.exception("Feedback generation failed")
            yield ("error", {"code": "feedback_failed", "message": str(exc)[:500]})
            return
        raise

    first_source = documents[0][0]
    citation_items = build_citation_items(
        full_response,
        index_map,
        first_source.id,
        first_source.name,
        chunk_bbox,
    )
    display_text = _save_feedback_progress()

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
    yield ("done", {"content": display_text})


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
