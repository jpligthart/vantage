# ADR-003: Agent framework

## Status

Accepted

## Context

Requirements specify PydanticAI and Ollama with streaming. Tools arrive in phase 2.

## Decision

Use **PydanticAI** behind a narrow chat adapter (`stream_chat`). Phase 1: no tools, plain text streaming. Ollama via OpenAI-compatible API (`/v1`).

## Consequences

- Framework can be swapped by replacing the adapter module.
- Structured output is not required for chat UX in phase 1.
