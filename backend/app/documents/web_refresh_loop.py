"""Periodic conditional refresh for web sources."""

from __future__ import annotations

import asyncio
import logging

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.documents.processor import process_source
from app.documents.web_ingest import due_web_sources, refresh_web_source
from app.models.entities import Source, SourceStatus

logger = logging.getLogger(__name__)

# Check every hour whether any web source is due for refresh.
_POLL_SECONDS = 3600


async def web_refresh_loop(stop: asyncio.Event) -> None:
    settings = get_settings()
    # Stagger first run so startup migrations/API are ready.
    try:
        await asyncio.wait_for(stop.wait(), timeout=60)
        return
    except asyncio.TimeoutError:
        pass

    while not stop.is_set():
        try:
            await asyncio.to_thread(_run_due_refreshes, settings)
        except Exception:
            logger.exception("Periodic web refresh failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=_POLL_SECONDS)
            return
        except asyncio.TimeoutError:
            continue


def _run_due_refreshes(settings) -> None:
    db = SessionLocal()
    try:
        due = due_web_sources(db, settings)
        if not due:
            return
        logger.info("Checking %s web source(s) for updates", len(due))
        for source in due:
            try:
                outcome = refresh_web_source(db, source.id, force=False, settings=settings)
                if outcome == "updated":
                    process_source(db, source.id)
            except Exception:
                logger.exception("Failed refreshing web source %s", source.id)
                failed = db.get(Source, source.id)
                if failed:
                    failed.status = SourceStatus.failed
                    failed.error = "Periodieke vernieuwing mislukt"
                    db.commit()
    finally:
        db.close()
