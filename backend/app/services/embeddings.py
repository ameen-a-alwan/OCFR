"""Local embedding model wrapper (sentence-transformers)."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Sequence

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Encode text into dense vectors using a local sentence-transformers model.

    Callers are responsible for Arabic normalization *before* encode when the
    goal is search / similarity matching. Official / display text should not
    be passed through letter-folding normalization.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model = None

    def _load_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            name = self.settings.embedding_model_name
            device = self.settings.embedding_device
            logger.info("Loading embedding model %s on %s", name, device)
            self._model = SentenceTransformer(name, device=device)
        return self._model

    @property
    def dimension(self) -> int:
        model = self._load_model()
        return int(model.get_sentence_embedding_dimension())

    def embed_texts(self, texts: Sequence[str], *, batch_size: int = 32) -> list[list[float]]:
        """Embed a batch of strings. Empty inputs yield zero vectors."""
        if not texts:
            return []

        model = self._load_model()
        cleaned = [t if t and t.strip() else " " for t in texts]
        vectors = model.encode(
            cleaned,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return [v.tolist() for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        return self.embed_texts([text])[0]


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()
