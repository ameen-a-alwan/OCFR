"""Application configuration for the local Arabic DMS & similarity engine."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Project root: OCFR/backend/
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"


class Settings(BaseSettings):
    """Runtime settings — all paths and models are local by default."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "OCFR — منظومة الوثائق والأمن السيبراني"
    app_version: str = "0.2.0"
    debug: bool = False

    # CORS — used only when UI and API are on different origins (local split mode).
    # Same-origin Docker (/api on same host) does not need CORS for browser calls.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost",
        "http://127.0.0.1",
    ]

    # Auth (override in production: JWT_SECRET=...)
    jwt_secret: str = "ocfr-dev-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 72

    # Local storage — override with DATA_DIR=/path in Docker if needed
    data_dir: Path = DATA_DIR
    uploads_dir: Path | None = None
    raw_dir: Path | None = None
    chroma_dir: Path | None = None
    sqlite_path: Path | None = None

    # ChromaDB
    chroma_collection_name: str = "arabic_documents"

    # Embeddings — fully local sentence-transformers model
    # Alternatives: "intfloat/multilingual-e5-small"
    embedding_model_name: str = "BAAI/bge-m3"
    embedding_device: str = "cpu"  # set to "cuda" if a local GPU is available

    # Chunking
    chunk_size: int = 500
    chunk_overlap: int = 50

    # Similarity / duplicate detection
    similarity_threshold: float = 0.80
    default_top_k: int = 5
    max_top_k: int = 50

    # OCR
    ocr_languages: list[str] = ["ar", "en"]
    ocr_gpu: bool = False
    # Minimum printable chars on a PDF page before treating it as image-based
    pdf_text_min_chars: int = 40

    # VirusTotal
    vt_api_key: str = ""
    vt_base_url: str = "https://www.virustotal.com/api/v3"
    max_upload_mb: int = 32

    # Log analyzer
    log_max_upload_mb: int = 20

    # Gemini assistant (set GEMINI_API_KEY in env — never commit the key)
    gemini_api_key: str = ""
    # Preferred model; assistant falls back across working Flash models on 429/503
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    def model_post_init(self, __context: object) -> None:
        base = Path(self.data_dir)
        if self.uploads_dir is None:
            self.uploads_dir = base / "uploads"
        if self.raw_dir is None:
            self.raw_dir = base / "raw"
        if self.chroma_dir is None:
            self.chroma_dir = base / "chroma"
        if self.sqlite_path is None:
            self.sqlite_path = base / "app.db"

    def ensure_directories(self) -> None:
        """Create local data directories if they do not exist."""
        assert self.uploads_dir and self.raw_dir and self.chroma_dir
        for path in (self.data_dir, self.uploads_dir, self.raw_dir, self.chroma_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    settings = Settings()
    settings.ensure_directories()
    return settings
