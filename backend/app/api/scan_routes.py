"""Virus scan proxy — public with rate limits; history stays JWT-gated elsewhere."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from app.core.activity import log_activity
from app.core.auth import OptionalUser
from app.core.config import get_settings
from app.core.rate_limit import client_ip, virus_scan_limiter
from app.core.security import safe_filename
from app.services.scan_service import (
    get_analysis_result,
    get_file_report,
    get_url_report,
    submit_file_scan,
    submit_url_scan,
)
from app.services.vt_client import VTAPIError

logger = logging.getLogger(__name__)
router = APIRouter()

_ANALYSIS_ID_RE = re.compile(r"^[A-Za-z0-9_\-=]{8,200}$")
_HASH_RE = re.compile(r"^[A-Fa-f0-9]{32,128}$")
_URL_RE = re.compile(r"^https?://[^\s]{3,2000}$", re.IGNORECASE)


def _vt_error(code: str, message: str, status: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
    )


def _rate(request: Request) -> None:
    try:
        virus_scan_limiter.check(f"virus:{client_ip(request)}")
    except Exception as exc:  # HTTPException from limiter
        from fastapi import HTTPException

        if isinstance(exc, HTTPException):
            raise
        raise


@router.post("/files")
async def api_submit_file(
    request: Request,
    user: OptionalUser,
    file: UploadFile = File(...),
):
    _rate(request)
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    try:
        filename = safe_filename(file.filename)
        if not filename:
            return _vt_error("BadRequestError", "Empty file name")
        data = await file.read()
        if len(data) > max_bytes:
            return _vt_error(
                "BadRequestError",
                f"File exceeds {settings.max_upload_mb} MB limit",
                413,
            )
        if not data:
            return _vt_error("BadRequestError", "Empty file")
        raw = submit_file_scan(data, filename)
        log_activity(
            request,
            action="virus_scan_file",
            category="virus",
            detail=f"فحص ملف: {filename}",
            user=user,
            resource_type="file",
            resource_id=filename[:120],
        )
        return raw
    except VTAPIError as e:
        logger.error("File scan failed '%s': %s - %s", file.filename, e.code, e.message)
        return _vt_error(e.code, e.message, e.status_code)
    except Exception as e:
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            return _vt_error("RateLimited", e.detail if isinstance(e.detail, str) else "rate limit", e.status_code)
        logger.error("Unexpected /files error: %s", e)
        return _vt_error("InternalError", "حدث خطأ غير متوقع", 500)


@router.post("/urls")
async def api_submit_url(
    request: Request,
    user: OptionalUser,
    url: str | None = Form(None),
):
    _rate(request)
    try:
        body_url = url
        if not body_url:
            try:
                data = await request.json()
                body_url = (data or {}).get("url")
            except Exception:
                body_url = None
        body_url = (body_url or "").strip()
        if not _URL_RE.match(body_url):
            return _vt_error("BadRequestError", "رابط غير صالح")
        raw = submit_url_scan(body_url)
        log_activity(
            request,
            action="virus_scan_url",
            category="virus",
            detail=f"فحص رابط: {body_url[:180]}",
            user=user,
            resource_type="url",
            resource_id=body_url[:200],
        )
        return raw
    except VTAPIError as e:
        logger.error("URL scan failed: %s - %s", e.code, e.message)
        return _vt_error(e.code, e.message, e.status_code)
    except Exception as e:
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            return _vt_error("RateLimited", e.detail if isinstance(e.detail, str) else "rate limit", e.status_code)
        logger.error("Unexpected /urls error: %s", e)
        return _vt_error("InternalError", "حدث خطأ غير متوقع", 500)


@router.get("/analyses/{analysis_id}")
async def api_get_analysis(request: Request, analysis_id: str):
    _rate(request)
    if not _ANALYSIS_ID_RE.match(analysis_id):
        return _vt_error("BadRequestError", "معرف تحليل غير صالح")
    try:
        return get_analysis_result(analysis_id)
    except VTAPIError as e:
        logger.error(
            "Analysis fetch failed '%s': %s - %s", analysis_id, e.code, e.message
        )
        return _vt_error(e.code, e.message, e.status_code)
    except Exception as e:
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            return _vt_error("RateLimited", e.detail if isinstance(e.detail, str) else "rate limit", e.status_code)
        logger.error("Unexpected /analyses error: %s", e)
        return _vt_error("InternalError", "حدث خطأ غير متوقع", 500)


@router.get("/files/{file_hash}")
async def api_get_file_report(request: Request, file_hash: str):
    _rate(request)
    if not _HASH_RE.match(file_hash):
        return _vt_error("BadRequestError", "قيمة التجزئة غير صالحة")
    try:
        return get_file_report(file_hash)
    except VTAPIError as e:
        logger.error("File report failed '%s': %s - %s", file_hash, e.code, e.message)
        return _vt_error(e.code, e.message, e.status_code)
    except Exception as e:
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            return _vt_error("RateLimited", e.detail if isinstance(e.detail, str) else "rate limit", e.status_code)
        logger.error("Unexpected /files/<hash> error: %s", e)
        return _vt_error("InternalError", "حدث خطأ غير متوقع", 500)


@router.get("/urls/report")
async def api_get_url_report(request: Request, url: str = ""):
    _rate(request)
    url = (url or "").strip()
    if not _URL_RE.match(url):
        return _vt_error("BadRequestError", "رابط غير صالح")
    try:
        return get_url_report(url)
    except VTAPIError as e:
        logger.error("URL report failed '%s': %s - %s", url, e.code, e.message)
        return _vt_error(e.code, e.message, e.status_code)
    except Exception as e:
        from fastapi import HTTPException

        if isinstance(e, HTTPException):
            return _vt_error("RateLimited", e.detail if isinstance(e.detail, str) else "rate limit", e.status_code)
        logger.error("Unexpected /urls/report error: %s", e)
        return _vt_error("InternalError", "حدث خطأ غير متوقع", 500)
