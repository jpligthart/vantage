from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    db.execute(text("SELECT 1"))
    writable = os_accessible(settings.data_dir)
    return {"status": "ok" if writable else "degraded", "dataDirWritable": writable}


def os_accessible(path: Path) -> bool:
    try:
        test = path / ".write_test"
        test.write_text("ok", encoding="utf-8")
        test.unlink()
        return True
    except OSError:
        return False
