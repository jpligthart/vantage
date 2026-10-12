from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    data_dir: Path = Path("./data")
    database_url: str = "sqlite:///./data/review_assistant.db"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_host: str = "http://localhost:11434"
    default_context_tokens: int = 8192
    chat_timeout_seconds: int = 120
    max_upload_bytes: int = 52_428_800
    processing_timeout_seconds: int = 600
    cors_origins: str = (
        "http://127.0.0.1:7847,http://localhost:7847,"
        "http://127.0.0.1:5173,http://localhost:5173"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sources_dir(self) -> Path:
        return self.data_dir / "sources"

    @property
    def docling_dir(self) -> Path:
        return self.data_dir / "docling"


@lru_cache
def get_settings() -> Settings:
    return Settings()
