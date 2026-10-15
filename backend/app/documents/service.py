import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.documents.fts import remove_chunks_for_document
from app.models.entities import Document, DocumentSection, Source, SourceChunk, SourceStatus


def get_source_or_404(db: Session, source_id: str) -> Source:
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


def source_to_dict(source: Source) -> dict:
    return {
        "id": source.id,
        "name": source.name,
        "type": source.type.value,
        "status": source.status.value,
        "error": source.error,
        "isReference": bool(source.is_reference),
        "isDefault": bool(getattr(source, "is_default", False)),
        "student": source.student,
        "subject": source.subject,
        "importedAt": source.imported_at.isoformat() if source.imported_at else None,
    }


def list_sources(db: Session) -> list[Source]:
    return db.query(Source).order_by(Source.imported_at.desc()).all()


def get_structure(db: Session, source_id: str) -> dict:
    source = get_source_or_404(db, source_id)
    doc = db.query(Document).filter(Document.source_id == source.id).first()
    if doc is None:
        return {"sections": [], "pageCount": None}

    sections = (
        db.query(DocumentSection)
        .filter(DocumentSection.document_id == doc.id)
        .order_by(DocumentSection.order_index)
        .all()
    )
    return {
        "documentId": doc.id,
        "title": doc.title,
        "pageCount": doc.page_count,
        "sections": [
            {"id": s.id, "title": s.title, "level": s.level, "parentId": s.parent_id}
            for s in sections
        ],
    }


def get_chunks_for_document(db: Session, document_id: str) -> list[SourceChunk]:
    return (
        db.query(SourceChunk)
        .filter(SourceChunk.document_id == document_id)
        .order_by(SourceChunk.prompt_index)
        .all()
    )


def delete_source(db: Session, source_id: str) -> None:
    source = get_source_or_404(db, source_id)
    doc = db.query(Document).filter(Document.source_id == source.id).first()
    if doc:
        remove_chunks_for_document(db, doc.id)

    for path_str in [source.storage_path]:
        try:
            Path(path_str).unlink(missing_ok=True)
        except OSError:
            pass
    if doc:
        for p in [doc.docling_json_path, doc.html_preview_path]:
            if p:
                Path(p).unlink(missing_ok=True)

    db.delete(source)
    db.commit()


def chunk_bbox(chunk: SourceChunk) -> dict | None:
    if not chunk.bbox_json:
        return None
    try:
        return json.loads(chunk.bbox_json)
    except json.JSONDecodeError:
        return None
