"""Shared path / filename hardening helpers."""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException

_UNSAFE_NAME = re.compile(r"[^\w.\u0600-\u06FF\- ]+", re.UNICODE)


def safe_filename(name: str | None, *, default: str = "upload.bin") -> str:
    """Return a basename-only filename safe for storage (no path traversal)."""
    raw = (name or default).strip() or default
    base = Path(raw).name
    base = base.replace("\x00", "")
    if not base or base in {".", ".."} or ".." in base:
        base = default
    # Collapse path separators that Path.name might miss on odd inputs
    base = base.replace("/", "_").replace("\\", "_")
    cleaned = _UNSAFE_NAME.sub("_", base).strip(" ._")
    if not cleaned:
        cleaned = default
    return cleaned[:180]


def assert_within_base(path: Path, *bases: Path) -> Path:
    """Resolve path and ensure it stays under one of the allowed base dirs."""
    resolved = path.resolve()
    for base in bases:
        base_r = base.resolve()
        try:
            resolved.relative_to(base_r)
            return resolved
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail="مسار ملف غير صالح")
