import re
from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.entities import SourceChunk

# Common Dutch/English function words that add noise to OR queries.
_STOPWORDS = frozenset(
    {
        "de",
        "het",
        "een",
        "en",
        "van",
        "in",
        "op",
        "te",
        "dat",
        "die",
        "is",
        "voor",
        "met",
        "als",
        "aan",
        "om",
        "bij",
        "naar",
        "uit",
        "niet",
        "ook",
        "er",
        "of",
        "dan",
        "maar",
        "nog",
        "wel",
        "zijn",
        "was",
        "worden",
        "wordt",
        "deze",
        "dit",
        "zo",
        "al",
        "over",
        "wat",
        "hoe",
        "wie",
        "waar",
        "zegt",
        "the",
        "a",
        "an",
        "and",
        "or",
        "to",
        "of",
        "in",
        "on",
        "for",
        "with",
        "is",
        "are",
        "be",
        "this",
        "that",
        "as",
        "by",
        "from",
        "it",
        "at",
    }
)

_TOKEN_RE = re.compile(r"[0-9A-Za-zÀ-ÿ]{2,}", re.UNICODE)


def normalize_fts_query(query: str, *, min_chars: int = 2) -> str | None:
    """Turn free text into an FTS5 OR query; return None if nothing usable remains."""
    if not query or not query.strip():
        return None
    tokens: list[str] = []
    seen: set[str] = set()
    for raw in _TOKEN_RE.findall(query):
        lower = raw.lower()
        if len(lower) < min_chars or lower in _STOPWORDS:
            continue
        if lower in seen:
            continue
        seen.add(lower)
        # Quote tokens so FTS5 special characters do not break MATCH.
        safe = lower.replace('"', "")
        if not safe:
            continue
        tokens.append(f'"{safe}"')
    if not tokens:
        return None
    return " OR ".join(tokens)


def index_chunk(db: Session, chunk_id: str, document_id: str, content: str) -> None:
    db.execute(
        text("INSERT INTO chunk_fts (chunk_id, document_id, content) VALUES (:cid, :did, :content)"),
        {"cid": chunk_id, "did": document_id, "content": content},
    )


def remove_chunks_for_document(db: Session, document_id: str) -> None:
    db.execute(
        text("DELETE FROM chunk_fts WHERE document_id = :did"),
        {"did": document_id},
    )


def search_chunks(
    db: Session,
    document_ids: Sequence[str],
    query: str,
    *,
    limit: int = 24,
    min_query_chars: int = 2,
) -> list[SourceChunk]:
    """Return SourceChunks matching query within the given documents, best rank first."""
    if not document_ids or limit <= 0:
        return []

    match = normalize_fts_query(query, min_chars=min_query_chars)
    if match is None:
        return []

    placeholders = ", ".join(f":d{i}" for i in range(len(document_ids)))
    params: dict[str, object] = {"q": match, "lim": limit}
    for i, doc_id in enumerate(document_ids):
        params[f"d{i}"] = doc_id

    rows = db.execute(
        text(
            f"""
            SELECT chunk_id
            FROM chunk_fts
            WHERE chunk_fts MATCH :q
              AND document_id IN ({placeholders})
            ORDER BY rank
            LIMIT :lim
            """
        ),
        params,
    ).fetchall()

    chunk_ids = [row[0] for row in rows]
    if not chunk_ids:
        return []

    chunks = (
        db.query(SourceChunk)
        .filter(SourceChunk.id.in_(chunk_ids))
        .all()
    )
    by_id = {c.id: c for c in chunks}
    return [by_id[cid] for cid in chunk_ids if cid in by_id]


def fallback_leading_chunks(
    db: Session,
    document_ids: Sequence[str],
    *,
    per_document: int = 4,
    limit: int = 24,
) -> list[SourceChunk]:
    """First N chunks per document (by prompt_index) when FTS has no usable hits."""
    if not document_ids or limit <= 0 or per_document <= 0:
        return []

    selected: list[SourceChunk] = []
    for doc_id in document_ids:
        rows = (
            db.query(SourceChunk)
            .filter(SourceChunk.document_id == doc_id)
            .order_by(SourceChunk.prompt_index.asc())
            .limit(per_document)
            .all()
        )
        selected.extend(rows)
        if len(selected) >= limit:
            break
    return selected[:limit]
