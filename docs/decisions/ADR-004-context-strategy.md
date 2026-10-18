# ADR-004: Context strategy

## Status

Accepted (updated)

## Context

Small documents use full context; large reference frameworks (e.g. HBO-i PDFs) often exceed local model budgets. Requirements call for progressive complexity: full context when possible, retrieval when needed. Embeddings / sqlite-vec remain a later phase (ADR-001).

## Decision

**Default:** full document context for all attached sources (student work + references).

**When the combined context does not fit** the model budget (minus response reserve):

1. If **student documents alone** do not fit → return `document_too_large` (no silent truncation of student work).
2. If student documents fit but references do not → keep **full student context** and retrieve reference chunks via **SQLite FTS5** (`chunk_fts`), using the user question / feedback draft as the query. Strategy label: `retrieved_references`.
3. Empty or unusable FTS query / no hits → fall back to the leading chunks of each reference document (introduction / start of the framework).

Token estimate: tiktoken `cl100k_base`. Default context fallback: 8192 via `DEFAULT_CONTEXT_TOKENS`.

FTS knobs: `FTS_CHUNK_LIMIT`, `FTS_MIN_QUERY_CHARS`, `FTS_FALLBACK_PER_DOCUMENT`.

## Consequences

- Large kader PDFs can stay attached without blowing the context window on every turn.
- Answers based on retrieved references may miss passages outside the search hits; the system prompt states that kaders are partial.
- Semantic / hybrid retrieval (embeddings) can replace or augment FTS later without changing the strategy labels.
