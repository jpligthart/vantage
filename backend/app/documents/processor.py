import html
import logging
import uuid
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import DoclingDocument
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.documents.fts import index_chunk
from app.documents.provenance import bbox_to_json
from app.models.entities import Document, DocumentSection, Source, SourceChunk, SourceStatus, SourceType

logger = logging.getLogger(__name__)

MAX_CHUNK_CHARS = 2000
_processing_lock = False


def _split_text(text: str, max_len: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_len:
        return [text]
    parts: list[str] = []
    current: list[str] = []
    length = 0
    for para in text.split("\n"):
        para = para.strip()
        if not para:
            continue
        if length + len(para) + 1 > max_len and current:
            parts.append("\n".join(current))
            current = [para]
            length = len(para)
        else:
            current.append(para)
            length += len(para) + 1
    if current:
        parts.append("\n".join(current))
    return parts


def _page_height(dl_doc: DoclingDocument, page_no: int | None) -> float | None:
    if page_no is None or page_no not in dl_doc.pages:
        return None
    page = dl_doc.pages[page_no]
    return float(page.size.height) if page.size else None


def _build_html_preview(dl_doc: DoclingDocument, anchor_map: dict[str, str]) -> str:
    body_parts: list[str] = []
    for chunk_id, text in anchor_map.items():
        body_parts.append(
            f'<section id="{html.escape(chunk_id)}" class="chunk">'
            f"<p>{html.escape(text)}</p></section>"
        )
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'/>"
        "<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;line-height:1.5}"
        ".chunk{margin-bottom:1.5rem;padding:.5rem;border-left:3px solid #ccc}</style>"
        "</head><body>"
        + "".join(body_parts)
        + "</body></html>"
    )


def _process_plain_text_file(
    db: Session, source: Source, path: Path, settings
) -> None:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("Geen tekst om te verwerken.")

    settings.docling_dir.mkdir(parents=True, exist_ok=True)
    document = Document(
        source_id=source.id,
        title=source.name,
        page_count=None,
        docling_json_path=None,
    )
    db.add(document)
    db.flush()

    default_section = DocumentSection(
        document_id=document.id,
        title="Inhoud",
        level=1,
        order_index=0,
    )
    db.add(default_section)
    db.flush()

    prompt_index = 0
    anchor_preview: dict[str, str] = {}
    for piece in _split_text(raw, MAX_CHUNK_CHARS):
        prompt_index += 1
        chunk_id = str(uuid.uuid4())
        anchor_id = f"chunk-{prompt_index}"
        chunk = SourceChunk(
            id=chunk_id,
            document_id=document.id,
            section_id=default_section.id,
            prompt_index=prompt_index,
            anchor_id=anchor_id,
            content=piece,
            page_no=None,
            section_title=default_section.title,
            bbox_json=None,
        )
        db.add(chunk)
        index_chunk(db, chunk_id, document.id, piece)
        anchor_preview[anchor_id] = piece

    html_path = settings.docling_dir / f"{source.id}.html"
    html_path.write_text(_build_html_preview_from_anchors(anchor_preview), encoding="utf-8")
    document.html_preview_path = str(html_path)


def _build_html_preview_from_anchors(anchor_map: dict[str, str]) -> str:
    body_parts: list[str] = []
    for anchor_id, text in anchor_map.items():
        body_parts.append(
            f'<section id="{html.escape(anchor_id)}" class="chunk">'
            f"<p>{html.escape(text)}</p></section>"
        )
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'/>"
        "<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;line-height:1.5;white-space:pre-wrap}"
        ".chunk{margin-bottom:1.5rem;padding:.5rem;border-left:3px solid #ccc}</style>"
        "</head><body>"
        + "".join(body_parts)
        + "</body></html>"
    )


def process_source(db: Session, source_id: str) -> None:
    global _processing_lock
    settings = get_settings()
    source = db.get(Source, source_id)
    if source is None:
        return

    if _processing_lock:
        source.status = SourceStatus.queued
        db.commit()
        return

    _processing_lock = True
    source.status = SourceStatus.processing
    source.error = None
    db.commit()

    try:
        path = Path(source.storage_path)
        if not path.is_file():
            raise FileNotFoundError(f"Source file missing: {path}")

        if source.type == SourceType.text:
            _process_plain_text_file(db, source, path, settings)
            source.status = SourceStatus.ready
            db.commit()
            logger.info("Processed text source %s", source_id)
            return

        pipeline_options = PdfPipelineOptions(do_ocr=False)
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )
        result = converter.convert(str(path))
        dl_doc: DoclingDocument = result.document

        settings.docling_dir.mkdir(parents=True, exist_ok=True)
        json_path = settings.docling_dir / f"{source_id}.json"
        dl_doc.save_as_json(json_path)

        page_count = len(dl_doc.pages) if dl_doc.pages else None
        document = Document(
            source_id=source.id,
            title=source.name,
            page_count=page_count,
            docling_json_path=str(json_path),
        )
        db.add(document)
        db.flush()

        default_section = DocumentSection(
            document_id=document.id,
            title="Inhoud",
            level=1,
            order_index=0,
        )
        db.add(default_section)
        db.flush()

        prompt_index = 0
        anchor_preview: dict[str, str] = {}

        texts = getattr(dl_doc, "texts", []) or []
        for item in texts:
            raw = getattr(item, "text", None) or ""
            if not raw.strip():
                continue

            page_no = None
            bbox_json = None
            prov_list = getattr(item, "prov", None) or []
            if prov_list:
                prov = prov_list[0]
                page_no = getattr(prov, "page_no", None)
                ph = _page_height(dl_doc, page_no)
                bbox_json = bbox_to_json(getattr(prov, "bbox", None), ph)

            for piece in _split_text(raw, MAX_CHUNK_CHARS):
                prompt_index += 1
                chunk_id = str(uuid.uuid4())
                anchor_id = f"chunk-{prompt_index}"
                chunk = SourceChunk(
                    id=chunk_id,
                    document_id=document.id,
                    section_id=default_section.id,
                    prompt_index=prompt_index,
                    anchor_id=anchor_id,
                    content=piece,
                    page_no=page_no,
                    section_title=default_section.title,
                    bbox_json=bbox_json,
                )
                db.add(chunk)
                index_chunk(db, chunk_id, document.id, piece)
                anchor_preview[anchor_id] = piece[:500]

        if prompt_index == 0:
            raise ValueError(
                "No extractable text found (scanned PDF or empty document). OCR is not enabled in phase 1."
            )

        if source.type == SourceType.docx or not texts:
            html_path = settings.docling_dir / f"{source_id}.html"
            if not anchor_preview and dl_doc:
                exported = dl_doc.export_to_html()
                html_path.write_text(exported, encoding="utf-8")
            else:
                html_path.write_text(_build_html_preview(dl_doc, anchor_preview), encoding="utf-8")
            document.html_preview_path = str(html_path)
        elif source.type == SourceType.pdf:
            html_path = settings.docling_dir / f"{source_id}.html"
            html_path.write_text(_build_html_preview(dl_doc, anchor_preview), encoding="utf-8")
            document.html_preview_path = str(html_path)

        source.status = SourceStatus.ready
        db.commit()
        logger.info("Processed source %s", source_id)
    except Exception as exc:
        logger.exception("Failed to process source %s", source_id)
        db.rollback()
        source = db.get(Source, source_id)
        if source:
            source.status = SourceStatus.failed
            source.error = str(exc)[:2000]
            db.commit()
    finally:
        _processing_lock = False
        _drain_queue(db)


def _drain_queue(db: Session) -> None:
    next_source = (
        db.query(Source)
        .filter(Source.status == SourceStatus.queued)
        .order_by(Source.imported_at.asc())
        .first()
    )
    if next_source:
        process_source(db, next_source.id)
