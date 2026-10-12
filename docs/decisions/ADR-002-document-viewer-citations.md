# ADR-002: Document viewer and citations

## Status

Accepted

## Context

Citations must map to real locations. Docling JSON preserves provenance; Markdown/HTML export does not.

## Decision

- Persist **Docling JSON** per source.
- PDF: **PDF.js** + normalized bounding boxes from Docling provenance.
- DOCX: **HTML preview** with per-chunk anchors; no page numbers in UI.
- Model cites via `[[chunk:Cn]]` markers; backend resolves to DB chunks and strips invalid markers.

## Consequences

- Displayed excerpts come from the database, not free-form model text.
- Scanned PDFs without text fail until OCR is added.
