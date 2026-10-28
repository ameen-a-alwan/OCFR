"""Semantic search and real-time similarity / duplicate detection.

Important split:
  - Search & similarity *matching* always normalize Arabic (query + index vectors).
  - User-facing results are **one row per unique document** (prefer original files).
  - Suggested corrections use full official text from the app SQLite registry.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.config import Settings, get_settings
from app.core.database import AppDatabase, get_app_database
from app.core.vector_store import VectorStore, get_vector_store
from app.services.normalization import normalize_arabic


def _distance_to_similarity(distance: float | None) -> float:
    """Chroma cosine space returns distance; convert to similarity in [0, 1]."""
    if distance is None:
        return 0.0
    sim = 1.0 - float(distance)
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


def _title_key(name: str) -> str:
    base = Path_stem(name).lower().strip()
    base = re.sub(r"\s+", " ", base)
    # Strip uuid prefixes like "abc-..._filename"
    base = re.sub(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[_-]?",
        "",
        base,
        flags=re.I,
    )
    return base


def Path_stem(name: str) -> str:
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name


@dataclass
class MatchHit:
    """One matched *document* (file or text entry), not a chunk."""

    filename: str
    file_type: str
    source_id: str
    score: float
    entry_type: str = "file"
    open_url: str = ""
    content_hash: str | None = None


@dataclass
class SearchResult:
    query: str
    normalized_query: str
    top_k: int
    results: list[MatchHit] = field(default_factory=list)


@dataclass
class SimilarDocument:
    filename: str
    file_type: str
    source_id: str
    score: float
    suggested_text: str
    entry_type: str = "text"
    open_url: str = ""


@dataclass
class SimilarityCheckResult:
    is_duplicate: bool
    threshold: float
    max_score: float
    similar_documents: list[SimilarDocument] = field(default_factory=list)
    suggested_corrections: list[str] = field(default_factory=list)
    related_references: list[str] = field(default_factory=list)


class SearchService:
    """Query the corpus with normalized Arabic semantic search."""

    def __init__(
        self,
        settings: Settings | None = None,
        vector_store: VectorStore | None = None,
        database: AppDatabase | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.vector_store = vector_store or get_vector_store()
        self.database = database or get_app_database()

    def search(self, query: str, top_k: int | None = None) -> SearchResult:
        top_k = top_k or self.settings.default_top_k
        top_k = max(1, min(top_k, self.settings.max_top_k))

        normalized = normalize_arabic(query)
        fetch_n = min(max(top_k * 20, top_k), max(self.vector_store.count(), 1))
        raw = self.vector_store.query(normalized_query=normalized, top_k=fetch_n)
        file_hits = self._collapse_unique(raw)[:top_k]
        return SearchResult(
            query=query,
            normalized_query=normalized,
            top_k=top_k,
            results=file_hits,
        )

    def check_similarity(
        self,
        draft_text: str,
        *,
        threshold: float | None = None,
        top_k: int | None = None,
    ) -> SimilarityCheckResult:
        threshold = (
            self.settings.similarity_threshold if threshold is None else float(threshold)
        )
        top_k = top_k or self.settings.default_top_k
        top_k = max(1, min(top_k, self.settings.max_top_k))

        normalized = normalize_arabic(draft_text)
        if not normalized.strip():
            return SimilarityCheckResult(
                is_duplicate=False,
                threshold=threshold,
                max_score=0.0,
            )

        fetch_n = min(max(top_k * 20, top_k), max(self.vector_store.count(), 1))
        raw = self.vector_store.query(normalized_query=normalized, top_k=fetch_n)
        file_hits = self._collapse_unique(raw)

        similar: list[SimilarDocument] = []
        for hit in file_hits:
            if hit.score < threshold:
                continue
            if len(similar) >= top_k:
                break
            entry = self.database.get_entry(hit.source_id) if hit.source_id else None
            official = (entry.content if entry and entry.content else "") or ""
            if not official.strip():
                continue
            similar.append(
                SimilarDocument(
                    filename=hit.filename,
                    file_type=hit.file_type,
                    source_id=hit.source_id,
                    score=hit.score,
                    suggested_text=official,
                    entry_type=hit.entry_type,
                    open_url=hit.open_url,
                )
            )

        max_score = max((d.score for d in similar), default=0.0)
        suggestions = [d.suggested_text for d in similar]
        references = [d.filename for d in similar]

        return SimilarityCheckResult(
            is_duplicate=bool(similar),
            threshold=threshold,
            max_score=max_score,
            similar_documents=similar,
            suggested_corrections=suggestions,
            related_references=references,
        )

    def _collapse_unique(self, raw: dict) -> list[MatchHit]:
        """Collapse chunks → unique documents.

        Rules:
        1. Skip orphaned chroma rows with no SQLite entry.
        2. Best score per source_id.
        3. Prefer entry_type=file over text when same content_hash or same title.
        """
        ids = (raw.get("ids") or [[]])[0]
        metas = (raw.get("metadatas") or [[]])[0]
        dists = (raw.get("distances") or [[]])[0]

        best: dict[str, MatchHit] = {}
        order: list[str] = []
        entry_cache: dict[str, object] = {}

        for i, _id in enumerate(ids):
            meta = metas[i] if i < len(metas) and metas[i] else {}
            dist = dists[i] if i < len(dists) else None
            source_id = str(meta.get("source_id") or "")
            if not source_id:
                continue
            score = round(_distance_to_similarity(dist), 4)

            if source_id not in entry_cache:
                entry_cache[source_id] = self.database.get_entry(source_id)
            entry = entry_cache[source_id]
            if not entry:
                # Orphan vector — ignore (avoids ghost "db" duplicates)
                continue

            filename = entry.title or str(meta.get("filename") or "unknown")
            file_type = entry.file_type or str(meta.get("file_type") or "unknown")
            entry_type = entry.entry_type or str(meta.get("entry_type") or "file")
            content_hash = getattr(entry, "content_hash", None)

            hit = MatchHit(
                filename=filename,
                file_type=file_type,
                source_id=source_id,
                score=score,
                entry_type=entry_type,
                open_url=f"/entries/{source_id}/open",
                content_hash=content_hash,
            )
            prev = best.get(source_id)
            if prev is None:
                best[source_id] = hit
                order.append(source_id)
            elif score > prev.score:
                best[source_id] = hit

        # Second pass: merge duplicates by content_hash / title, prefer files
        by_key: dict[str, MatchHit] = {}
        key_order: list[str] = []
        for sid in order:
            hit = best[sid]
            if hit.content_hash:
                key = f"hash:{hit.content_hash}"
            else:
                key = f"title:{_title_key(hit.filename)}"

            prev = by_key.get(key)
            if prev is None:
                by_key[key] = hit
                key_order.append(key)
                continue

            prefer_new = False
            if prev.entry_type != "file" and hit.entry_type == "file":
                prefer_new = True
            elif prev.entry_type == hit.entry_type and hit.score > prev.score:
                prefer_new = True
            if prefer_new:
                by_key[key] = hit

        return [by_key[k] for k in key_order]
