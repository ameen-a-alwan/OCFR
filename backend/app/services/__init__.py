"""Domain services: OCR, parsing, normalization, embeddings, indexing."""

from app.services.normalization import (
    is_mostly_arabic,
    normalize_arabic,
    normalize_alef,
    normalize_ta_marbuta,
    normalize_yaa,
    strip_tashkeel,
)

__all__ = [
    "is_mostly_arabic",
    "normalize_arabic",
    "normalize_alef",
    "normalize_ta_marbuta",
    "normalize_yaa",
    "strip_tashkeel",
]
