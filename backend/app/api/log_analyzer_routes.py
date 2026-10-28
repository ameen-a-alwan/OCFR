"""Authenticated log analyzer API."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.core.activity import log_activity
from app.core.auth import CanAnalyzeLogs, CanReadLogs
from app.core.config import get_settings
from app.core.database import get_app_database
from app.services.ip_enrichment import build_ip_enrichment
from app.services.log_detections import analyze_events
from app.services.log_parser import parse_log_bytes

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_SUFFIXES = {".txt", ".log", ".csv"}


@router.post("/analyze")
async def analyze_log(
    request: Request,
    user: CanAnalyzeLogs,
    file: UploadFile = File(...),
):
    settings = get_settings()
    max_bytes = settings.log_max_upload_mb * 1024 * 1024

    filename = file.filename or "upload.txt"
    suffix = Path(filename).suffix.lower()
    if suffix and suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يُسمح بملفات txt أو log أو csv فقط",
        )

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف فارغ",
        )
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"حجم الملف يتجاوز {settings.log_max_upload_mb} ميجابايت",
        )

    try:
        events = parse_log_bytes(data)
        base = analyze_events(events)
        ip_rows, geo = build_ip_enrichment(base.pop("ip_counts", {}))
        base.pop("ips_raw", None)
        base["ips"] = ip_rows
        base["geo"] = geo
        base["filename"] = filename
    except Exception as e:
        logger.exception("Log analysis failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"فشل تحليل السجل: {e}",
        ) from e

    db = get_app_database()
    report_id = db.create_log_report(
        user_id=user.id, filename=filename, report=base
    )
    log_activity(
        request,
        action="log_analyze",
        category="logs",
        detail=f"تحليل سجل: {filename}",
        user=user,
        resource_type="log_report",
        resource_id=report_id,
    )
    return {"id": report_id, "filename": filename, "report": base}


@router.get("/reports")
async def list_reports(user: CanReadLogs, limit: int = 50):
    limit = min(max(limit, 1), 100)
    rows = get_app_database().list_log_reports(user_id=user.id, limit=limit)
    return {"reports": rows}


@router.get("/reports/{report_id}")
async def get_report(report_id: str, user: CanReadLogs):
    row = get_app_database().get_log_report(report_id, user_id=user.id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="التقرير غير موجود",
        )
    return row
