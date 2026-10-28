"""Text chunking utilities."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    """A single text segment with optional page provenance."""

    text: str
    page_number: int | None = None
    chunk_index: int = 0


def chunk_text(
    text: str,
    *,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    page_number: int | None = None,
) -> list[TextChunk]:
    """Split text into overlapping character windows.

    Prefers breaking on whitespace near the window end so Arabic words are
    less often cut mid-token.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and < chunk_size")

    chunks: list[TextChunk] = []
    start = 0
    length = len(cleaned)
    index = 0

    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            # Prefer a whitespace break in the last 20% of the window
            window = cleaned[start:end]
            rel = window.rfind(" ")
            min_rel = int(chunk_size * 0.8)
            if rel >= min_rel:
                end = start + rel

        piece = cleaned[start:end].strip()
        if piece:
            chunks.append(TextChunk(text=piece, page_number=page_number, chunk_index=index))
            index += 1

        if end >= length:
            break
        start = max(end - chunk_overlap, start + 1)

    return chunks


def chunk_pages(
    pages: list[tuple[int, str]],
    *,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[TextChunk]:
    """Chunk a sequence of (page_number, text) pairs, preserving page numbers."""
    results: list[TextChunk] = []
    global_index = 0
    for page_number, page_text in pages:
        for ch in chunk_text(
            page_text,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            page_number=page_number,
        ):
            results.append(
                TextChunk(text=ch.text, page_number=ch.page_number, chunk_index=global_index)
            )
            global_index += 1
    return results
