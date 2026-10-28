"""Pydantic request/response models for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Arabic / mixed search query")
    top_k: int | None = Field(
        default=None,
        ge=1,
        le=50,
        description="Number of *files* to return (defaults to server setting)",
    )


class SearchHitResponse(BaseModel):
    """One matched document — never a text chunk fragment."""

    filename: str
    file_type: str
    source_id: str
    score: float
    entry_type: str = "file"
    open_url: str


class SearchResponse(BaseModel):
    query: str
    normalized_query: str
    top_k: int
    results: list[SearchHitResponse]


class SimilarityRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Draft text as the user types")
    threshold: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Override similarity threshold (default from config, e.g. 0.80)",
    )
    top_k: int | None = Field(default=None, ge=1, le=50)


class SimilarDocumentResponse(BaseModel):
    filename: str
    file_type: str
    source_id: str
    score: float
    entry_type: str = "text"
    open_url: str = ""
    suggested_text: str = Field(
        ...,
        description="Full official entry text — not letter-normalized",
    )


class SimilarityResponse(BaseModel):
    is_duplicate: bool
    threshold: float
    max_score: float
    similar_documents: list[SimilarDocumentResponse]
    suggested_corrections: list[str] = Field(
        ...,
        description="Official full texts suitable as correction targets",
    )
    related_references: list[str]


class IngestTextRequest(BaseModel):
    text: str = Field(..., min_length=1)
    filename: str = "inline.txt"


class IngestResponse(BaseModel):
    source_id: str
    filename: str
    file_type: str
    pages_parsed: int
    ocr_pages: int
    stored_path: str
    entry_type: str = "file"
    # Kept for backwards compatibility; UI should not display this.
    chunks_indexed: int = 0


class EntryResponse(BaseModel):
    id: str
    title: str
    entry_type: str
    file_type: str
    content: str | None = None
    content_preview: str | None = None
    pages_parsed: int
    ocr_pages: int
    created_at: str
    open_url: str
    has_file: bool = False


class EntriesListResponse(BaseModel):
    total: int
    entries: list[EntryResponse]


class CollectionStatsResponse(BaseModel):
    collection_name: str
    document_chunks: int
    db_entries: int = 0
