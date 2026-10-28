"""Scan history routes — JWT + virus.history permission."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.core.auth import CanViewVirusHistory
from app.services.scan_service import (
    get_all_scans,
    get_scan_by_id,
    get_scan_statistics,
)

router = APIRouter()


@router.get("")
@router.get("/")
async def api_get_all_scans(
    _user: CanViewVirusHistory,
    limit: int = Query(50, ge=1, le=200),
    verdict: str | None = Query(None),
):
    result = get_all_scans(limit=limit, verdict=verdict)
    status = 200 if result["success"] else 400
    return JSONResponse(content=result, status_code=status)


@router.get("/statistics")
async def api_get_scan_statistics(_user: CanViewVirusHistory):
    result = get_scan_statistics()
    status = 200 if result["success"] else 400
    return JSONResponse(content=result, status_code=status)


@router.get("/{scan_id}")
async def api_get_scan_by_id(scan_id: int, _user: CanViewVirusHistory):
    result = get_scan_by_id(scan_id)
    status = 200 if result["success"] else 404
    return JSONResponse(content=result, status_code=status)
