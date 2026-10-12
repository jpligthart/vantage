import hashlib
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import Settings

PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK\x03\x04"


def _detect_type(filename: str, header: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf") and header.startswith(PDF_MAGIC):
        return "pdf"
    if lower.endswith(".docx") and header.startswith(DOCX_MAGIC):
        return "docx"
    raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")


async def save_upload(file: UploadFile, settings: Settings) -> tuple[str, Path, str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File too large")

    file_type = _detect_type(file.filename, content[:4])
    source_id = str(uuid.uuid4())
    ext = ".pdf" if file_type == "pdf" else ".docx"
    settings.sources_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.sources_dir / f"{source_id}{ext}"
    dest.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    safe_name = Path(file.filename).name
    if ".." in safe_name or "/" in safe_name or "\\" in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    return source_id, dest, file_type, checksum
