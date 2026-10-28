"""Ingestion pipeline: parse → persist in app SQLite → chunk → index Chroma."""

from __future__ import annotations

import hashlib
import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings, get_settings
from app.core.database import AppDatabase, get_app_database
from app.core.security import safe_filename
from app.core.vector_store import VectorStore, get_vector_store
from app.services.chunking import TextChunk, chunk_pages
from app.services.normalization import normalize_arabic
from app.services.parser import DocumentParser, ParsedDocument

logger = logging.getLogger(__name__)


def content_fingerprint(text: str) -> str:
    """Stable hash of normalized content for duplicate detection."""
    normalized = normalize_arabic(text or "").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@dataclass
class IngestResult:
    source_id: str
    filename: str
    file_type: str
    pages_parsed: int
    chunks_indexed: int
    ocr_pages: int
    stored_path: str
    entry_type: str = "file"
    reused: bool = False


class IngestionService:
    """Index documents into Chroma and register them in the app SQLite DB."""

    def __init__(
        self,
        settings: Settings | None = None,
        parser: DocumentParser | None = None,
        vector_store: VectorStore | None = None,
        database: AppDatabase | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.parser = parser or DocumentParser(self.settings)
        self.vector_store = vector_store or get_vector_store()
        self.database = database or get_app_database()
        self.settings.ensure_directories()

    def ingest_file(self, path: Path, *, copy_to_uploads: bool = True) -> IngestResult:
        path = Path(path)
        source_id = str(uuid.uuid4())

        stored_path = path
        if copy_to_uploads:
            dest = self.settings.uploads_dir / f"{source_id}_{safe_filename(path.name)}"
            shutil.copy2(path, dest)
            stored_path = dest

        parsed = self.parser.parse(stored_path)
        return self._index_parsed(
            parsed,
            source_id=source_id,
            stored_path=stored_path,
            entry_type="file",
            content=parsed.full_text or None,
        )

    def ingest_text(
        self,
        text: str,
        *,
        filename: str = "inline.txt",
        file_type: str = "text",
    ) -> IngestResult:
        from app.services.parser import ParsedPage

        source_id = str(uuid.uuid4())
        safe_name = safe_filename(filename, default="inline.txt")
        stored = self.settings.raw_dir / f"{source_id}_{safe_name}"
        stored.write_text(text, encoding="utf-8")

        parsed = ParsedDocument(
            filename=safe_name,
            file_type=file_type,
            source_path=str(stored.resolve()),
            pages=[ParsedPage(page_number=1, text=text, used_ocr=False)],
        )
        return self._index_parsed(
            parsed,
            source_id=source_id,
            stored_path=stored,
            entry_type="text",
            content=text,
        )

    def _index_parsed(
        self,
        parsed: ParsedDocument,
        *,
        source_id: str,
        stored_path: Path,
        entry_type: str,
        content: str | None,
    ) -> IngestResult:
        digest = content_fingerprint(content or "")
        if digest:
            existing = self.database.find_entry_by_content_hash(digest)
            # Reuse existing unless we're promoting a text copy to a real file
            if existing and not (
                entry_type == "file" and existing.entry_type == "text"
            ):
                logger.info(
                    "Duplicate content for %s → reusing entry %s",
                    parsed.filename,
                    existing.id,
                )
                if str(stored_path) != (existing.stored_path or ""):
                    try:
                        if source_id in stored_path.name:
                            stored_path.unlink(missing_ok=True)
                    except OSError:
                        pass
                return IngestResult(
                    source_id=existing.id,
                    filename=existing.title,
                    file_type=existing.file_type,
                    pages_parsed=existing.pages_parsed,
                    chunks_indexed=existing.chunks_indexed,
                    ocr_pages=existing.ocr_pages,
                    stored_path=existing.stored_path or "",
                    entry_type=existing.entry_type,
                    reused=True,
                )

        page_pairs = [(p.page_number, p.text) for p in parsed.pages if p.text.strip()]
        chunks = chunk_pages(
            page_pairs,
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
        )
        if not chunks:
            raise ValueError(f"No extractable text in '{parsed.filename}'")

        original_texts = [c.text for c in chunks]
        normalized_texts = [normalize_arabic(c.text) for c in chunks]
        keep = [
            (o, n, c)
            for o, n, c in zip(original_texts, normalized_texts, chunks)
            if n.strip()
        ]
        if not keep:
            raise ValueError(
                f"Text became empty after normalization for '{parsed.filename}'"
            )

        original_texts = [k[0] for k in keep]
        normalized_texts = [k[1] for k in keep]
        chunks = [k[2] for k in keep]

        metadatas = [
            self._meta(parsed, source_id, stored_path, c, entry_type) for c in chunks
        ]
        self.vector_store.add_chunks(
            original_texts=original_texts,
            normalized_texts=normalized_texts,
            metadatas=metadatas,
        )

        ocr_pages = sum(1 for p in parsed.pages if p.used_ocr)
        self.database.upsert_entry(
            entry_id=source_id,
            title=parsed.filename,
            entry_type=entry_type,
            file_type=parsed.file_type,
            content=content,
            stored_path=str(stored_path),
            pages_parsed=len(parsed.pages),
            chunks_indexed=len(chunks),
            ocr_pages=ocr_pages,
            content_hash=digest or None,
        )

        result = IngestResult(
            source_id=source_id,
            filename=parsed.filename,
            file_type=parsed.file_type,
            pages_parsed=len(parsed.pages),
            chunks_indexed=len(chunks),
            ocr_pages=ocr_pages,
            stored_path=str(stored_path),
            entry_type=entry_type,
        )
        logger.info(
            "Ingested %s (%s/%s) → %d chunks; registered in app.db",
            result.filename,
            result.entry_type,
            result.file_type,
            result.chunks_indexed,
        )
        return result

    @staticmethod
    def _meta(
        parsed: ParsedDocument,
        source_id: str,
        stored_path: Path,
        chunk: TextChunk,
        entry_type: str,
    ) -> dict:
        return {
            "source_id": source_id,
            "filename": parsed.filename,
            "file_type": parsed.file_type,
            "entry_type": entry_type,
            "page_number": chunk.page_number if chunk.page_number is not None else 0,
            "chunk_index": chunk.chunk_index,
            "source_path": str(stored_path),
        }
