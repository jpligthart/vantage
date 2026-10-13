import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from app.core.config import Settings


def save_pasted_text(
    text: str, settings: Settings, title: str | None
) -> tuple[str, str, str, str]:
    stripped = text.strip()
    if not stripped:
        raise HTTPException(status_code=400, detail="Text is empty")

    encoded = stripped.encode("utf-8")
    if len(encoded) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Text too large")

    source_id = str(uuid.uuid4())
    settings.sources_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.sources_dir / f"{source_id}.txt"
    dest.write_text(stripped, encoding="utf-8")

    checksum = hashlib.sha256(encoded).hexdigest()
    if title and title.strip():
        name = title.strip()[:512]
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        name = f"Geplakte tekst {stamp}"
    return source_id, str(dest), checksum, name
