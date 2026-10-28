"""OCR helpers for image-based PDF pages (EasyOCR, Arabic + English)."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import numpy as np

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class OCRService:
    """Lazy-loaded EasyOCR reader for Arabic document pages."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._reader: Any = None

    def _load_reader(self):
        if self._reader is None:
            import easyocr

            langs = list(self.settings.ocr_languages)
            logger.info("Initializing EasyOCR languages=%s gpu=%s", langs, self.settings.ocr_gpu)
            self._reader = easyocr.Reader(langs, gpu=self.settings.ocr_gpu, verbose=False)
        return self._reader

    def extract_text_from_image(self, image: np.ndarray | Any) -> str:
        """Run OCR on a numpy image (RGB or BGR) and return concatenated text."""
        reader = self._load_reader()
        if not isinstance(image, np.ndarray):
            image = np.asarray(image)

        # EasyOCR expects RGB ndarray
        results = reader.readtext(image, detail=0, paragraph=True)
        if not results:
            return ""
        if isinstance(results, list):
            return "\n".join(str(r).strip() for r in results if str(r).strip())
        return str(results).strip()


@lru_cache
def get_ocr_service() -> OCRService:
    return OCRService()
