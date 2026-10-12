# ADR-004: Context strategy

## Status

Accepted

## Context

Small documents use full context; large documents need retrieval in later phases.

## Decision

Phase 1: **full document context only**. If estimated tokens exceed model budget (minus response reserve), return `document_too_large` — no silent truncation.

Token estimate: tiktoken `cl100k_base`. Default context fallback: 8192 via `DEFAULT_CONTEXT_TOKENS`.

## Consequences

- Users may need a larger-context local model for long portfolios until phase 2 retrieval ships.
