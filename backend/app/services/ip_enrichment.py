"""IP enrichment via ip-api.com and optional VirusTotal."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.vt_client import VTAPIError, has_api_key, vt_get_ip_report

logger = logging.getLogger(__name__)

# Skip private / link-local ranges for external enrichment
PRIVATE_PREFIXES = (
    "10.",
    "192.168.",
    "127.",
    "169.254.",
    "0.",
)


def _is_private(ip: str) -> bool:
    if ip.startswith(PRIVATE_PREFIXES):
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            return 16 <= second <= 31
        except (IndexError, ValueError):
            return False
    return False


def enrich_ips_geo(ips: list[str], *, max_ips: int = 40) -> dict[str, dict[str, Any]]:
    """Batch geolocation via free ip-api.com (up to 100 per request)."""
    public = [ip for ip in ips if not _is_private(ip)][:max_ips]
    result: dict[str, dict[str, Any]] = {}

    for ip in ips:
        if _is_private(ip):
            result[ip] = {
                "country": "Private",
                "countryCode": "LAN",
                "city": "",
                "lat": None,
                "lon": None,
                "isp": "Private network",
                "private": True,
            }

    if not public:
        return result

    # ip-api batch: POST http://ip-api.com/batch
    try:
        with httpx.Client(timeout=20.0) as client:
            # Process in chunks of 100
            for i in range(0, len(public), 100):
                chunk = public[i : i + 100]
                payload = [
                    {
                        "query": ip,
                        "fields": "status,message,country,countryCode,city,lat,lon,isp,query",
                    }
                    for ip in chunk
                ]
                resp = client.post("http://ip-api.com/batch", json=payload)
                if resp.status_code != 200:
                    logger.warning("ip-api batch failed: %s", resp.status_code)
                    continue
                for item in resp.json():
                    q = item.get("query")
                    if not q:
                        continue
                    if item.get("status") != "success":
                        result[q] = {
                            "country": "Unknown",
                            "countryCode": "",
                            "city": "",
                            "lat": None,
                            "lon": None,
                            "isp": item.get("message", ""),
                            "private": False,
                        }
                    else:
                        result[q] = {
                            "country": item.get("country") or "Unknown",
                            "countryCode": item.get("countryCode") or "",
                            "city": item.get("city") or "",
                            "lat": item.get("lat"),
                            "lon": item.get("lon"),
                            "isp": item.get("isp") or "",
                            "private": False,
                        }
    except Exception as e:
        logger.warning("Geo enrichment failed: %s", e)

    return result


def enrich_ips_vt(ips: list[str], *, max_ips: int = 10) -> dict[str, dict[str, Any]]:
    """Optional VirusTotal IP reputation (rate-limited; small sample)."""
    out: dict[str, dict[str, Any]] = {}
    if not has_api_key():
        return out

    public = [ip for ip in ips if not _is_private(ip)][:max_ips]
    for ip in public:
        try:
            raw = vt_get_ip_report(ip)
            attrs = raw.get("data", {}).get("attributes", {})
            stats = attrs.get("last_analysis_stats", {})
            out[ip] = {
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "reputation": attrs.get("reputation"),
                "as_owner": attrs.get("as_owner"),
            }
        except VTAPIError as e:
            logger.info("VT IP lookup skipped for %s: %s", ip, e.message)
        except Exception as e:
            logger.warning("VT IP lookup error for %s: %s", ip, e)
    return out


def build_ip_enrichment(
    ip_counts: dict[str, int],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ips = list(ip_counts.keys())
    geo_map = enrich_ips_geo(ips)
    vt_map = enrich_ips_vt(ips)

    rows: list[dict[str, Any]] = []
    for ip, count in sorted(ip_counts.items(), key=lambda x: -x[1]):
        geo = geo_map.get(ip, {})
        vt = vt_map.get(ip, {})
        rows.append(
            {
                "ip": ip,
                "related_events": count,
                "geo": geo,
                "vt_malicious": vt.get("malicious"),
                "vt_suspicious": vt.get("suspicious"),
                "vt_reputation": vt.get("reputation"),
                "vt_as_owner": vt.get("as_owner"),
            }
        )

    country_agg: dict[str, dict[str, Any]] = {}
    for ip, count in ip_counts.items():
        geo = geo_map.get(ip) or {}
        country = geo.get("country") or "Unknown"
        if country == "Private":
            continue
        entry = country_agg.setdefault(
            country,
            {
                "country": country,
                "lat": geo.get("lat"),
                "lon": geo.get("lon"),
                "count": 0,
            },
        )
        entry["count"] += count
        if entry.get("lat") is None and geo.get("lat") is not None:
            entry["lat"] = geo.get("lat")
            entry["lon"] = geo.get("lon")

    geo_chart = sorted(country_agg.values(), key=lambda x: -x["count"])
    return rows, geo_chart
