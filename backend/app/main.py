from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, models, sessions, sources
from app.core.config import get_settings
from app.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.sources_dir.mkdir(parents=True, exist_ok=True)
    settings.docling_dir.mkdir(parents=True, exist_ok=True)
    _run_migrations()
    yield


def _run_migrations() -> None:
    from pathlib import Path

    settings = get_settings()
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, "head")


def create_app() -> FastAPI:
    app = FastAPI(title="Review Assistant", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(models.router)
    app.include_router(sources.router)
    app.include_router(sessions.router)
    return app


app = create_app()
