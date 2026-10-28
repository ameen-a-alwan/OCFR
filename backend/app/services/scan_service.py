"""VirusTotal scan service — submit, poll, enrich verdicts."""

from __future__ import annotations

import base64
import logging

from app.core.database import get_app_database
from app.services.vt_client import (
    VTAPIError,
    has_api_key,
    vt_get_analysis,
    vt_get_file_report,
    vt_get_url_report,
    vt_post_file,
    vt_post_url,
)

logger = logging.getLogger(__name__)


def _require_api_key() -> None:
    if not has_api_key():
        raise VTAPIError(
            "AuthenticationRequiredError", "X-Apikey header is missing", 401
        )


def build_verdict(stats: dict) -> dict:
    malicious = stats.get("malicious", 0)
    suspicious = stats.get("suspicious", 0)
    harmless = stats.get("harmless", 0)
    undetected = stats.get("undetected", 0)
    total = (
        malicious
        + suspicious
        + harmless
        + undetected
        + stats.get("timeout", 0)
    )

    if malicious > 0:
        verdict = "infected"
    elif suspicious > 0:
        verdict = "suspicious"
    else:
        verdict = "clean"

    safety_percentage = (
        round(((total - malicious - suspicious) / total) * 100, 1) if total > 0 else 0
    )

    return {
        "verdict": verdict,
        "malicious": malicious,
        "suspicious": suspicious,
        "harmless": harmless,
        "undetected": undetected,
        "total_engines": total,
        "safety_percentage": safety_percentage,
    }


def build_engine_results(results: dict) -> list:
    engines = []
    for engine_name, info in (results or {}).items():
        category = info.get("category")
        if category in ("malicious", "suspicious"):
            status = "مصاب"
            has_virus = True
        elif category in ("harmless", "undetected"):
            status = "غير مصاب"
            has_virus = False
        elif category == "type-unsupported":
            status = "نوع الملف غير مدعوم من هذا الإنجن"
            has_virus = None
        elif category in ("failure", "timeout", "confirmed-timeout"):
            status = "فشل الفحص"
            has_virus = None
        else:
            status = "غير معروف"
            has_virus = None

        engines.append(
            {
                "engine_name": engine_name,
                "has_virus": has_virus,
                "status_ar": status,
                "malware_name": info.get("result"),
            }
        )

    def _sort_key(e: dict):
        if e["has_virus"] is True:
            priority = 0
        elif e["has_virus"] is None:
            priority = 1
        else:
            priority = 2
        return (priority, e["engine_name"])

    engines.sort(key=_sort_key)
    return engines


def url_to_id(url: str) -> str:
    return base64.urlsafe_b64encode(url.encode()).decode().strip("=")


def submit_file_scan(file_bytes: bytes, filename: str) -> dict:
    _require_api_key()
    if not filename:
        raise VTAPIError("BadRequestError", "File name is missing", 400)
    if not file_bytes:
        raise VTAPIError("BadRequestError", "File is empty", 400)

    raw = vt_post_file(file_bytes, filename)
    analysis_id = raw["data"]["id"]
    get_app_database().insert_scan("file", filename, analysis_id)
    return raw


def submit_url_scan(url: str) -> dict:
    _require_api_key()
    url = (url or "").strip()
    if not url:
        raise VTAPIError("BadRequestError", "url is required", 400)
    if not url.startswith(("http://", "https://")):
        url = "http://" + url

    raw = vt_post_url(url)
    analysis_id = raw["data"]["id"]
    get_app_database().insert_scan("url", url, analysis_id)
    return raw


def get_analysis_result(analysis_id: str) -> dict:
    _require_api_key()
    raw = vt_get_analysis(analysis_id)

    attrs = raw.get("data", {}).get("attributes", {})
    if attrs.get("status") == "completed":
        verdict_data = build_verdict(attrs.get("stats", {}))
        engines_data = build_engine_results(attrs.get("results", {}))

        db = get_app_database()
        record = db.fetch_scan_by_analysis_id(analysis_id)
        vt_link = None
        if record and record.get("scan_type") == "url":
            vt_link = (
                f"https://www.virustotal.com/gui/url/{url_to_id(record['target'])}"
            )
        elif record and record.get("scan_type") == "file":
            vt_link = f"https://www.virustotal.com/gui/file-analysis/{analysis_id}"

        db.update_scan(
            analysis_id=analysis_id,
            verdict=verdict_data["verdict"],
            malicious=verdict_data["malicious"],
            suspicious=verdict_data["suspicious"],
            harmless=verdict_data["harmless"],
            total_engines=verdict_data["total_engines"],
            vt_link=vt_link,
        )

        raw["verdict_summary"] = verdict_data
        raw["engines_results"] = engines_data
        if vt_link:
            raw["vt_link"] = vt_link

    return raw


def get_file_report(file_hash: str) -> dict:
    _require_api_key()
    return vt_get_file_report(file_hash)


def get_url_report(url: str) -> dict:
    _require_api_key()
    url = (url or "").strip()
    if not url:
        raise VTAPIError("BadRequestError", "url is required", 400)
    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    return vt_get_url_report(url_to_id(url))


def get_all_scans(*, limit: int = 50, verdict: str | None = None) -> dict:
    try:
        limit = min(int(limit), 200)
        result = get_app_database().fetch_all_scans(
            limit=limit, verdict_filter=verdict
        )
        return {
            "success": True,
            "message": "Scan history retrieved successfully",
            "data": result or [],
        }
    except Exception as e:
        logger.error("Error in get_all_scans: %s", e)
        return {"success": False, "message": f"Storage error: {e}", "data": None}


def get_scan_by_id(scan_id: int) -> dict:
    try:
        result = get_app_database().fetch_scan_by_id(scan_id)
        if not result:
            return {"success": False, "message": "Scan not found", "data": None}
        return {
            "success": True,
            "message": "Scan retrieved successfully",
            "data": result,
        }
    except Exception as e:
        logger.error("Error in get_scan_by_id: %s", e)
        return {"success": False, "message": f"Storage error: {e}", "data": None}


def get_scan_statistics() -> dict:
    try:
        result = get_app_database().fetch_scan_stats()
        return {
            "success": True,
            "message": "Statistics retrieved successfully",
            "data": result,
        }
    except Exception as e:
        logger.error("Error in get_scan_statistics: %s", e)
        return {"success": False, "message": f"Storage error: {e}", "data": None}
