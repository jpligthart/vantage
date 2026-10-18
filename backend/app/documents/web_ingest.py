"""Create and refresh web / DokuWiki sources."""

from __future__ import annotations

import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.documents.web_fetch import (
    fetch_web_source,
    is_unchanged_error,
    load_manifest,
    write_snapshot,
)
from app.models.entities import Source, SourceStatus, SourceType, WebMode

logger = logging.getLogger(__name__)


def create_web_source(
    db: Session,
    settings: Settings,
    *,
    url: str,
    mode: str,
    title: str | None,
    is_reference: bool,
    is_default: bool,
) -> Source:
    source_id = str(uuid.uuid4())
    dest = settings.sources_dir / source_id
    dest.mkdir(parents=True, exist_ok=True)

    try:
        result = fetch_web_source(url, mode, settings, force=True)
        checksum, page_count = write_snapshot(dest, result)
    except Exception:
        shutil.rmtree(dest, ignore_errors=True)
        raise

    name = (title or "").strip() or result.name
    source = Source(
        id=source_id,
        name=name[:512],
        type=SourceType.web,
        storage_path=str(dest),
        checksum=checksum,
        status=SourceStatus.queued,
        is_reference=is_reference or is_default,
        is_default=is_default,
        origin_url=result.origin_url,
        web_mode=WebMode.site if mode == "site" else WebMode.page,
        page_count=page_count,
        last_checked_at=datetime.now(timezone.utc),
        last_refreshed_at=datetime.now(timezone.utc),
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def refresh_web_source(
    db: Session,
    source_id: str,
    *,
    force: bool = False,
    settings: Settings | None = None,
) -> str:
    """
    Re-fetch a web source. Returns 'unchanged' | 'updated' | 'skipped'.
    Raises on hard failures (source marked failed by caller if needed).
    """
    settings = settings or get_settings()
    source = db.get(Source, source_id)
    if source is None or source.type != SourceType.web:
        return "skipped"
    if not source.origin_url or not source.web_mode:
        return "skipped"

    root = Path(source.storage_path)
    existing_manifest = None
    if root.is_dir():
        try:
            existing_manifest = load_manifest(root)
        except Exception:
            existing_manifest = None

    now = datetime.now(timezone.utc)
    mode = source.web_mode.value

    try:
        result = fetch_web_source(
            source.origin_url,
            mode,
            settings,
            existing_manifest=existing_manifest,
            force=force,
        )
    except Exception as exc:
        if is_unchanged_error(exc):
            source.last_checked_at = now
            db.commit()
            logger.info("Web source %s unchanged", source_id)
            return "unchanged"
        raise

    staging = settings.sources_dir / f"{source_id}.refresh"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        checksum, page_count = write_snapshot(
            staging, result, previous_dir=root if root.is_dir() else None
        )
        # Replace snapshot directory
        backup = settings.sources_dir / f"{source_id}.bak"
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        if root.exists():
            root.rename(backup)
        staging.rename(root)
        shutil.rmtree(backup, ignore_errors=True)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    source.checksum = checksum
    source.page_count = page_count
    source.last_checked_at = now
    source.last_refreshed_at = now
    source.status = SourceStatus.queued
    source.error = None
    db.commit()
    logger.info("Web source %s refreshed (%s pages)", source_id, page_count)
    return "updated"


def due_web_sources(db: Session, settings: Settings) -> list[Source]:
    interval_hours = max(1, settings.web_refresh_interval_hours)
    cutoff = datetime.now(timezone.utc).timestamp() - interval_hours * 3600
    sources = (
        db.query(Source)
        .filter(Source.type == SourceType.web, Source.status == SourceStatus.ready)
        .all()
    )
    due: list[Source] = []
    for source in sources:
        checked = source.last_checked_at
        if checked is None:
            due.append(source)
            continue
        ts = checked.timestamp() if checked.tzinfo else checked.replace(tzinfo=timezone.utc).timestamp()
        if ts <= cutoff:
            due.append(source)
    return due
