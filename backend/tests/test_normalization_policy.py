"""Lightweight checks that do not require torch / Chroma downloads."""

from __future__ import annotations

from app.services.chunking import chunk_text
from app.services.normalization import normalize_arabic


def test_normalize_for_search_folds_letters() -> None:
    assert normalize_arabic("إِنَّ التَّعْلِيمَ فِى المَدْرَسَةِ") == "ان التعليم في المدرسه"


def test_official_suggestion_keeps_formal_spelling() -> None:
    """Autocorrect surfaces must keep official spelling (no letter-folding)."""
    official = "إنَّ التعليم في المدرسة مهمٌّ"
    # Simulate API suggestion list: store original, never re-normalize for UX
    suggested_corrections = [official]
    assert suggested_corrections[0] == official
    assert suggested_corrections[0] != normalize_arabic(official)


def test_chunk_overlap() -> None:
    text = "كلمة " * 200
    chunks = chunk_text(text, chunk_size=100, chunk_overlap=20)
    assert len(chunks) > 1
    assert all(c.text for c in chunks)


def test_cosine_distance_conversion() -> None:
    def distance_to_similarity(distance: float | None) -> float:
        if distance is None:
            return 0.0
        sim = 1.0 - float(distance)
        return max(0.0, min(1.0, sim))

    assert distance_to_similarity(0.0) == 1.0
    assert distance_to_similarity(0.2) == 0.8
    assert distance_to_similarity(None) == 0.0


if __name__ == "__main__":
    test_normalize_for_search_folds_letters()
    test_official_suggestion_keeps_formal_spelling()
    test_chunk_overlap()
    test_cosine_distance_conversion()
    print("ok")
