"""Embedded ChromaDB vector store for Arabic document chunks."""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.api.models.Collection import Collection

from app.core.config import Settings, get_settings
from app.services.embeddings import EmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)


class VectorStore:
    """Persist and query document chunk embeddings in local ChromaDB.

    Design:
      - Embeddings are computed from *normalized* Arabic text (search matching).
      - Stored ``documents`` hold *original* official text (snippets / suggestions).
      - Metadata keeps provenance (filename, page, file_type, etc.).
    """

    def __init__(
        self,
        settings: Settings | None = None,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.embeddings = embedding_service or get_embedding_service()
        self.settings.ensure_directories()
        self._client = chromadb.PersistentClient(path=str(self.settings.chroma_dir))
        self._collection: Collection | None = None

    @property
    def collection(self) -> Collection:
        if self._collection is None:
            self._collection = self._client.get_or_create_collection(
                name=self.settings.chroma_collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    def count(self) -> int:
        return int(self.collection.count())

    def add_chunks(
        self,
        *,
        original_texts: list[str],
        normalized_texts: list[str],
        metadatas: list[dict[str, Any]],
        ids: list[str] | None = None,
    ) -> list[str]:
        """Index chunks: embed normalized text, store original for display."""
        if not original_texts:
            return []
        if len(original_texts) != len(normalized_texts) or len(original_texts) != len(metadatas):
            raise ValueError("original_texts, normalized_texts, and metadatas must align")

        chunk_ids = ids or [str(uuid.uuid4()) for _ in original_texts]
        vectors = self.embeddings.embed_texts(normalized_texts)

        # Keep a short normalized preview in metadata for debugging only;
        # never use it as the suggested correction surface.
        enriched: list[dict[str, Any]] = []
        for meta, norm in zip(metadatas, normalized_texts):
            row = dict(meta)
            row["normalized_preview"] = norm[:200]
            enriched.append(row)

        self.collection.add(
            ids=chunk_ids,
            embeddings=vectors,
            documents=original_texts,
            metadatas=enriched,
        )
        logger.info("Indexed %d chunks (collection size=%d)", len(chunk_ids), self.count())
        return chunk_ids

    def query(
        self,
        *,
        normalized_query: str,
        top_k: int = 5,
        where: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Semantic search using a *normalized* query embedding."""
        if not normalized_query.strip():
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

        if self.count() == 0:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

        embedding = self.embeddings.embed_query(normalized_query)
        n_results = min(max(top_k, 1), self.count())
        kwargs: dict[str, Any] = {
            "query_embeddings": [embedding],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        return self.collection.query(**kwargs)

    def delete_by_source(self, source_id: str) -> int:
        """Remove all chunks belonging to a source document id."""
        existing = self.collection.get(where={"source_id": source_id}, include=[])
        ids = existing.get("ids") or []
        if ids:
            self.collection.delete(ids=ids)
        return len(ids)

    def reset(self) -> None:
        """Drop and recreate the collection (destructive)."""
        name = self.settings.chroma_collection_name
        try:
            self._client.delete_collection(name)
        except Exception:  # noqa: BLE001 — collection may not exist
            pass
        self._collection = None
        _ = self.collection


@lru_cache
def get_vector_store() -> VectorStore:
    return VectorStore()
