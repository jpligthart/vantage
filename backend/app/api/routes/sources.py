from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.api.schemas import SourcePaste, SourceUpdate, SourceWebCreate
from app.core.config import get_settings
from app.core.database import get_db
from app.documents.paste import save_pasted_text
from app.documents.processor import densify_preview_html, process_source
from app.documents.service import (
    delete_source,
    get_source_or_404,
    get_structure,
    list_sources,
    source_to_dict,
)
from app.documents.upload import save_upload
from app.documents.web_ingest import create_web_source, refresh_web_source
from app.models.entities import Source, SourceStatus, SourceType

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("")
def get_sources(db: Session = Depends(get_db)) -> dict:
    return {"sources": [source_to_dict(source) for source in list_sources(db)]}


@router.post("/paste")
async def paste_source(
    body: SourcePaste,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    source_id, dest, checksum, name = save_pasted_text(body.text, settings, body.title)
    source = Source(
        id=source_id,
        name=name,
        type=SourceType.text,
        storage_path=dest,
        checksum=checksum,
        status=SourceStatus.queued,
        is_reference=body.isReference or body.isDefault,
        is_default=body.isDefault,
    )
    db.add(source)
    db.commit()
    background_tasks.add_task(_run_process, source_id)
    return {"sourceId": source_id, "status": source.status.value}


@router.post("/upload")
async def upload_source(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    is_reference: bool = False,
    is_default: bool = False,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    source_id, dest, file_type, checksum = await save_upload(file, settings)
    source = Source(
        id=source_id,
        name=Path(file.filename or "document").name,
        type=SourceType.pdf if file_type == "pdf" else SourceType.docx,
        storage_path=str(dest),
        checksum=checksum,
        status=SourceStatus.queued,
        is_reference=is_reference or is_default,
        is_default=is_default,
    )
    db.add(source)
    db.commit()
    background_tasks.add_task(_run_process, source_id)
    return {"sourceId": source_id, "status": source.status.value}


@router.post("/web")
async def web_source(
    body: SourceWebCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    try:
        source = create_web_source(
            db,
            settings,
            url=body.url,
            mode=body.mode,
            title=body.title,
            is_reference=body.isReference,
            is_default=body.isDefault,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ophalen mislukt: {exc}") from exc
    background_tasks.add_task(_run_process, source.id)
    return {"sourceId": source.id, "status": source.status.value}


@router.post("/{source_id}/refresh")
async def refresh_source(
    source_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    force: bool = False,
) -> dict:
    source = get_source_or_404(db, source_id)
    if source.type != SourceType.web:
        raise HTTPException(status_code=400, detail="Alleen web-bronnen kunnen vernieuwd worden")
    if source.status == SourceStatus.processing:
        raise HTTPException(status_code=409, detail="Bron wordt al verwerkt")
    try:
        outcome = refresh_web_source(db, source_id, force=force)
    except Exception as exc:
        source = get_source_or_404(db, source_id)
        source.status = SourceStatus.failed
        source.error = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=502, detail=f"Vernieuwen mislukt: {exc}") from exc

    if outcome == "updated":
        background_tasks.add_task(_run_process, source_id)
        source = get_source_or_404(db, source_id)
        return {"sourceId": source_id, "status": source.status.value, "outcome": outcome}
    source = get_source_or_404(db, source_id)
    return {
        "sourceId": source_id,
        "status": source.status.value,
        "outcome": outcome,
        "lastCheckedAt": source.last_checked_at.isoformat() if source.last_checked_at else None,
        "lastRefreshedAt": source.last_refreshed_at.isoformat() if source.last_refreshed_at else None,
    }


def _run_process(source_id: str) -> None:
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        process_source(db, source_id)
    finally:
        db.close()


@router.get("/{source_id}")
def get_source(source_id: str, db: Session = Depends(get_db)) -> dict:
    return source_to_dict(get_source_or_404(db, source_id))


@router.patch("/{source_id}")
def patch_source(source_id: str, body: SourceUpdate, db: Session = Depends(get_db)) -> dict:
    source = get_source_or_404(db, source_id)
    if body.isDefault is not None:
        source.is_default = body.isDefault
        if body.isDefault and body.isReference is None:
            source.is_reference = True
    if body.isReference is not None:
        source.is_reference = body.isReference
    if body.name is not None and body.name.strip():
        source.name = body.name.strip()
    db.commit()
    db.refresh(source)
    return source_to_dict(source)


@router.get("/{source_id}/status")
def get_source_status(source_id: str, db: Session = Depends(get_db)) -> dict:
    source = get_source_or_404(db, source_id)
    return {"id": source.id, "status": source.status.value, "error": source.error}


@router.get("/{source_id}/content")
def get_source_content(source_id: str, db: Session = Depends(get_db)) -> FileResponse:
    source = get_source_or_404(db, source_id)
    path = Path(source.storage_path)
    if source.type == SourceType.web:
        manifest = path / "manifest.json" if path.is_dir() else path
        if not manifest.is_file():
            raise HTTPException(status_code=404, detail="Web snapshot not found")
        return FileResponse(manifest, media_type="application/json", filename="manifest.json")
    if source.type == SourceType.pdf:
        media = "application/pdf"
    elif source.type == SourceType.text:
        media = "text/plain; charset=utf-8"
    else:
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return FileResponse(path, media_type=media, filename=source.name)


@router.get("/{source_id}/preview")
def get_source_preview(source_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    from app.models.entities import Document

    source = get_source_or_404(db, source_id)
    doc = db.query(Document).filter(Document.source_id == source.id).first()
    if doc and doc.html_preview_path and Path(doc.html_preview_path).is_file():
        raw = Path(doc.html_preview_path).read_text(encoding="utf-8")
        return HTMLResponse(densify_preview_html(raw))
    raise HTTPException(status_code=404, detail="Preview not available")


@router.get("/{source_id}/structure")
def source_structure(source_id: str, db: Session = Depends(get_db)) -> dict:
    return get_structure(db, source_id)


@router.delete("/{source_id}")
def remove_source(source_id: str, db: Session = Depends(get_db)) -> dict:
    delete_source(db, source_id)
    return {"deleted": True}
