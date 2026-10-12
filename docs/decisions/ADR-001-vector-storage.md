# ADR-001: Vector storage

## Status

Accepted

## Context

Phase 2 needs hybrid retrieval with semantic search. Requirements prefer avoiding a separate database container.

## Decision

Use **sqlite-vec** in the same SQLite database as relational data in phase 2. Phase 1 stores chunks without embeddings and pre-fills FTS5 only.

## Consequences

- Single backup path (`data/review_assistant.db` + files).
- If sqlite-vec limits are hit later, revisit a dedicated vector store.
