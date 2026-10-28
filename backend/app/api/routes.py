"""FastAPI routes: ingest, search, check-similarity, entries registry (JWT protected)."""

from __future__ import annotations

import logging
import mimetypes
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse

from app.api.schemas import (
    CollectionStatsResponse,
    EntriesListResponse,
    EntryResponse,
    IngestResponse,
    IngestTextRequest,
    SearchHitResponse,
    SearchRequest,
    SearchResponse,
    SimilarDocumentResponse,
    SimilarityRequest,
    SimilarityResponse,
)
from app.core.auth import CanDeleteDocuments, CanReadDocuments, CanWriteDocuments
from app.core.config import get_settings
from app.core.database import get_app_database
from app.core.security import assert_within_base, safe_filename
from app.core.vector_store import get_vector_store
from app.services.ingestion import IngestionService
from app.services.parser import SUPPORTED_EXTENSIONS
from app.services.search import SearchService

logger = logging.getLogger(__name__)

router = APIRouter()


def _ingestion() -> IngestionService:
    return IngestionService()


def _search() -> SearchService:
    return SearchService()


def _entry_response(r, *, include_content: bool = False) -> EntryResponse:
    preview = None
    if r.content:
        preview = (r.content[:240] + "…") if len(r.content) > 240 else r.content
    return EntryResponse(
        id=r.id,
        title=r.title,
        entry_type=r.entry_type,
        file_type=r.file_type,
        content=r.content if include_content else None,
        content_preview=preview,
        pages_parsed=r.pages_parsed,
        ocr_pages=r.ocr_pages,
        created_at=r.created_at,
        open_url=f"/entries/{r.id}/open",
        has_file=bool(r.stored_path),
    )


def _ingest_response(result) -> IngestResponse:
    return IngestResponse(
        source_id=result.source_id,
        filename=result.filename,
        file_type=result.file_type,
        pages_parsed=result.pages_parsed,
        ocr_pages=result.ocr_pages,
        stored_path=result.stored_path,
        entry_type=result.entry_type,
        chunks_indexed=result.chunks_indexed,
    )


@router.get("/stats", response_model=CollectionStatsResponse)
def collection_stats(_user: CanReadDocuments) -> CollectionStatsResponse:
    settings = get_settings()
    store = get_vector_store()
    db = get_app_database()
    return CollectionStatsResponse(
        collection_name=settings.chroma_collection_name,
        document_chunks=store.count(),
        db_entries=db.count_entries(),
    )


@router.get("/entries", response_model=EntriesListResponse)
def list_entries(_user: CanReadDocuments, limit: int = 50) -> EntriesListResponse:
    """List uploads and text entries (one row per document). Prefer unique files."""
    db = get_app_database()
    rows = db.list_entries(limit=limit)
    # Prefer file entries when same content_hash exists as text duplicate
    seen_hashes: set[str] = set()
    unique = []
    # Sort so files come first
    ordered = sorted(rows, key=lambda r: (0 if r.entry_type == "file" else 1, r.created_at))
    for r in ordered:
        if r.content_hash:
            if r.content_hash in seen_hashes:
                continue
            seen_hashes.add(r.content_hash)
        unique.append(r)
    unique.sort(key=lambda r: r.created_at, reverse=True)
    return EntriesListResponse(
        total=len(unique),
        entries=[_entry_response(r) for r in unique[:limit]],
    )


@router.get("/entries/{entry_id}", response_model=EntryResponse)
def get_entry(entry_id: str, _user: CanReadDocuments) -> EntryResponse:
    entry = get_app_database().get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    return _entry_response(entry, include_content=True)


@router.get("/entries/{entry_id}/open")
def open_entry(entry_id: str, _user: CanReadDocuments):
    """Open the stored file (PDF/DOCX/TXT) or return full text for text entries."""
    entry = get_app_database().get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="المستند غير موجود")

    settings = get_settings()
    path = Path(entry.stored_path) if entry.stored_path else None
    if path and path.is_file():
        path = assert_within_base(path, settings.uploads_dir, settings.raw_dir)
        media, _ = mimetypes.guess_type(str(path))
        if path.suffix.lower() == ".pdf":
            media = "application/pdf"
        elif path.suffix.lower() == ".txt" or entry.file_type in {"txt", "text"}:
            media = "text/plain; charset=utf-8"
        elif path.suffix.lower() == ".docx":
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return FileResponse(
            path,
            media_type=media or "application/octet-stream",
            filename=safe_filename(entry.title, default="document"),
            content_disposition_type="inline",
        )

    if entry.content:
        return PlainTextResponse(entry.content, media_type="text/plain; charset=utf-8")

    raise HTTPException(status_code=404, detail="لا يوجد ملف أو محتوى قابل للفتح")


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str, _user: CanDeleteDocuments) -> dict[str, str]:
    db = get_app_database()
    entry = db.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    try:
        get_vector_store().delete_by_source(entry_id)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to remove vectors for %s", entry_id)
    if entry.stored_path:
        try:
            Path(entry.stored_path).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete_entry(entry_id)
    return {"status": "deleted"}


@router.post("/ingest", response_model=IngestResponse)
async def ingest_file(
    _user: CanWriteDocuments,
    file: UploadFile = File(...),
) -> IngestResponse:
    """Upload and index a .pdf / .docx / .txt file (SQLite DBs are not accepted)."""
    filename = safe_filename(file.filename, default="upload.bin")
    suffix = Path(filename).suffix.lower()
    if suffix in {".db", ".sqlite", ".sqlite3"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "رفع ملفات قواعد البيانات غير مسموح. "
                "قاعدة SQLite داخلية للتطبيق فقط — أضف الملفات أو السجلات النصية من الواجهة."
            ),
        )
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{suffix}'. "
                f"Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            ),
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".bin") as tmp:
            tmp_path = Path(tmp.name)
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            tmp.write(content)

        result = _ingestion().ingest_file(tmp_path, copy_to_uploads=True)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Ingest failed for %s", filename)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc
    finally:
        try:
            if "tmp_path" in locals() and tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
        except OSError:
            pass

    return _ingest_response(result)


@router.post("/ingest/text", response_model=IngestResponse)
def ingest_text(body: IngestTextRequest, _user: CanWriteDocuments) -> IngestResponse:
    """Save a typed text entry into the app SQLite DB and index it."""
    try:
        result = _ingestion().ingest_text(
            body.text, filename=safe_filename(body.filename, default="inline.txt")
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Text ingest failed")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc

    return _ingest_response(result)


@router.post("/search", response_model=SearchResponse)
def search(body: SearchRequest, _user: CanReadDocuments) -> SearchResponse:
    """Semantic search — unique original entries only (no file+DB duplicates)."""
    try:
        result = _search().search(body.query, top_k=body.top_k)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc

    return SearchResponse(
        query=result.query,
        normalized_query=result.normalized_query,
        top_k=result.top_k,
        results=[
            SearchHitResponse(
                filename=h.filename,
                file_type=h.file_type,
                source_id=h.source_id,
                score=h.score,
                entry_type=h.entry_type,
                open_url=h.open_url,
            )
            for h in result.results
        ],
    )


@router.post("/check-similarity", response_model=SimilarityResponse)
def check_similarity(
    body: SimilarityRequest, _user: CanReadDocuments
) -> SimilarityResponse:
    try:
        result = _search().check_similarity(
            body.text,
            threshold=body.threshold,
            top_k=body.top_k,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Similarity check failed")
        raise HTTPException(status_code=500, detail=f"Similarity check failed: {exc}") from exc

    return SimilarityResponse(
        is_duplicate=result.is_duplicate,
        threshold=result.threshold,
        max_score=result.max_score,
        similar_documents=[
            SimilarDocumentResponse(
                filename=d.filename,
                file_type=d.file_type,
                source_id=d.source_id,
                score=d.score,
                entry_type=d.entry_type,
                open_url=d.open_url,
                suggested_text=d.suggested_text,
            )
            for d in result.similar_documents
        ],
        suggested_corrections=result.suggested_corrections,
        related_references=result.related_references,
    )
