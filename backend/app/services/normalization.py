"""Arabic text normalization utilities for local NLP pipelines.

Provides deterministic, dependency-light preprocessing suitable for
embedding, indexing, and similarity matching over Arabic documents.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Final

# Tashkeel (diacritics) + Quranic annotation marks commonly found in Arabic text.
_TASHKEEL_PATTERN: Final[re.Pattern[str]] = re.compile(
    "["
    "\u0610-\u061A"  # honorifics / Quranic marks
    "\u064B-\u065F"  # fathatan..sukun and related combining marks
    "\u0670"  # superscript alef
    "\u06D6-\u06ED"  # additional Quranic annotation signs
    "]"
)

# Tatweel (kashida) used for visual elongation.
_TATWEEL: Final[str] = "\u0640"

# Alef variants → bare Alef
_ALEF_MAP: Final[dict[str, str]] = {
    "أ": "ا",  # Alef with hamza above
    "إ": "ا",  # Alef with hamza below
    "آ": "ا",  # Alef madda
    "ٱ": "ا",  # Alef wasla
}

# Yaa / Alef Maqsura and Ta Marbuta normalizations
_YA_MAP: Final[dict[str, str]] = {
    "ى": "ي",  # Alef Maqsura → Yaa
    "ئ": "ي",  # Yaa with hamza (optional soft normalize)
}

_TA_MARBUTA_MAP: Final[dict[str, str]] = {
    "ة": "ه",
}

# Other common Arabic presentation / compatibility characters
_MISC_MAP: Final[dict[str, str]] = {
    "ؤ": "و",  # Waw with hamza → Waw
    "ء": "",  # standalone hamza (often dropped for search)
}

_WHITESPACE_PATTERN: Final[re.Pattern[str]] = re.compile(r"\s+")
_NON_PRINTABLE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]"
)


def strip_tashkeel(text: str) -> str:
    """Remove Arabic diacritics (Tashkeel) and related annotation marks."""
    return _TASHKEEL_PATTERN.sub("", text)


def strip_tatweel(text: str) -> str:
    """Remove Tatweel / Kashida elongation characters."""
    return text.replace(_TATWEEL, "")


def normalize_alef(text: str) -> str:
    """Normalize Alef variants (أ، إ، آ، ٱ) to bare Alef (ا)."""
    for src, dst in _ALEF_MAP.items():
        text = text.replace(src, dst)
    return text


def normalize_yaa(text: str) -> str:
    """Normalize Alef Maqsura (ى) and related forms to Yaa (ي)."""
    for src, dst in _YA_MAP.items():
        text = text.replace(src, dst)
    return text


def normalize_ta_marbuta(text: str) -> str:
    """Normalize Ta Marbuta (ة) to Ha (ه) for search consistency."""
    for src, dst in _TA_MARBUTA_MAP.items():
        text = text.replace(src, dst)
    return text


def normalize_hamza_forms(text: str) -> str:
    """Normalize common hamza-bearing letters for loose matching."""
    for src, dst in _MISC_MAP.items():
        text = text.replace(src, dst)
    return text


def normalize_whitespace(text: str) -> str:
    """Collapse runs of whitespace and strip edges."""
    return _WHITESPACE_PATTERN.sub(" ", text).strip()


def remove_non_printable(text: str) -> str:
    """Drop ASCII control characters that can appear after OCR."""
    return _NON_PRINTABLE_PATTERN.sub("", text)


def normalize_arabic(
    text: str,
    *,
    strip_diacritics: bool = True,
    strip_elongation: bool = True,
    normalize_letters: bool = True,
    normalize_hamza: bool = True,
    collapse_whitespace: bool = True,
    lowercase_latin: bool = True,
) -> str:
    """Apply a full Arabic normalization pipeline.

    Steps (in order):
      1. Unicode NFKC compatibility decomposition
      2. Remove non-printable control characters
      3. Strip Tashkeel / diacritics
      4. Strip Tatweel (kashida)
      5. Normalize Alef / Yaa / Ta Marbuta letter variants
      6. Optionally normalize hamza forms
      7. Collapse whitespace
      8. Optionally lowercase Latin characters (mixed docs)

    Args:
        text: Raw input string (may be empty).
        strip_diacritics: Remove Tashkeel marks.
        strip_elongation: Remove Tatweel.
        normalize_letters: Apply Alef/Yaa/Ta Marbuta maps.
        normalize_hamza: Soft-normalize hamza-bearing forms.
        collapse_whitespace: Collapse repeated whitespace.
        lowercase_latin: Lowercase any Latin letters present.

    Returns:
        Normalized Arabic text suitable for embedding and search.
    """
    if not text:
        return ""

    # Compatibility form helps fold presentation forms from OCR/PDF extractors.
    result = unicodedata.normalize("NFKC", text)
    result = remove_non_printable(result)

    if strip_diacritics:
        result = strip_tashkeel(result)

    if strip_elongation:
        result = strip_tatweel(result)

    if normalize_letters:
        result = normalize_alef(result)
        result = normalize_yaa(result)
        result = normalize_ta_marbuta(result)

    if normalize_hamza:
        result = normalize_hamza_forms(result)

    if collapse_whitespace:
        result = normalize_whitespace(result)

    if lowercase_latin:
        result = result.lower()

    return result


def is_mostly_arabic(text: str, threshold: float = 0.3) -> bool:
    """Heuristic: whether a string is predominantly Arabic script.

    Useful for deciding whether OCR language packs or Arabic-specific
    pipelines should be applied to a chunk of text.
    """
    if not text or not text.strip():
        return False

    arabic_chars = 0
    letter_chars = 0
    for ch in text:
        if ch.isalpha():
            letter_chars += 1
            # Arabic block + Arabic Supplement / Extended-A ranges
            code = ord(ch)
            if (
                0x0600 <= code <= 0x06FF
                or 0x0750 <= code <= 0x077F
                or 0x08A0 <= code <= 0x08FF
                or 0xFB50 <= code <= 0xFDFF
                or 0xFE70 <= code <= 0xFEFF
            ):
                arabic_chars += 1

    if letter_chars == 0:
        return False
    return (arabic_chars / letter_chars) >= threshold
