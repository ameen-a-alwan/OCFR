"""Low-level HTTP client for VirusTotal API v3 (httpx)."""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VTAPIError(Exception):
    """Mirrors VirusTotal's error envelope: {"error": {"code", "message"}}."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def has_api_key() -> bool:
    return bool(get_settings().vt_api_key)


def test_connection() -> bool:
    return has_api_key()


def _headers() -> dict[str, str]:
    return {"x-apikey": get_settings().vt_api_key}


def _base() -> str:
    return get_settings().vt_base_url.rstrip("/")


def _handle_response(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        code, message = "UnknownError", (resp.text or "Unknown error")[:200]
        try:
            err = resp.json().get("error", {})
            code = err.get("code", code)
            message = err.get("message", message)
        except Exception:
            pass
        raise VTAPIError(code, message, resp.status_code)
    return resp.json()


def vt_post_file(file_bytes: bytes, filename: str) -> dict:
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            f"{_base()}/files",
            headers=_headers(),
            files={"file": (filename, file_bytes)},
        )
    return _handle_response(resp)


def vt_post_url(url: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{_base()}/urls",
            headers=_headers(),
            data={"url": url},
        )
    return _handle_response(resp)


def vt_get_analysis(analysis_id: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{_base()}/analyses/{analysis_id}",
            headers=_headers(),
        )
    return _handle_response(resp)


def vt_get_file_report(file_hash: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{_base()}/files/{file_hash}",
            headers=_headers(),
        )
    return _handle_response(resp)


def vt_get_url_report(url_id: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{_base()}/urls/{url_id}",
            headers=_headers(),
        )
    return _handle_response(resp)


def vt_get_ip_report(ip: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{_base()}/ip_addresses/{ip}",
            headers=_headers(),
        )
    return _handle_response(resp)
