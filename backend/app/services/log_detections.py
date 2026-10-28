"""Rule-based detections for Windows Event logs."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

from app.services.log_parser import (
    LogEvent,
    extract_account,
    extract_ips_from_event,
    extract_logon_type,
)

EVENT_NAMES: dict[int, str] = {
    4624: "Successful logon",
    4625: "Failed logon",
    4634: "Logoff",
    4648: "Explicit credential logon",
    4672: "Special privileges assigned",
    4720: "User account created",
    4722: "User account enabled",
    4724: "Password reset attempt",
    4732: "Member added to security-enabled local group",
    4768: "Kerberos TGT requested",
    4769: "Kerberos service ticket requested",
    4776: "Credential validation",
    10028: "DCOM communication failure",
    5719: "NETLOGON secure session failure",
    4: "Kerberos AP_ERR_MODIFIED",
}

MITRE_MAP: dict[int, str] = {
    4625: "T1110 Brute Force",
    4624: "T1078 Valid Accounts",
    4672: "T1078 Privileged Account",
    4720: "T1136 Create Account",
    4724: "T1098 Account Manipulation",
    4732: "T1098 Account Manipulation",
    4648: "T1078 Valid Accounts",
}


def analyze_events(events: list[LogEvent]) -> dict[str, Any]:
    level_counts: Counter[str] = Counter()
    event_id_counts: Counter[int] = Counter()
    source_counts: Counter[str] = Counter()
    account_counts: Counter[str] = Counter()
    failed_by_account: Counter[str] = Counter()
    failed_by_ip: Counter[str] = Counter()
    timeline_buckets: dict[str, Counter[str]] = defaultdict(Counter)
    attacker_actions: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    ip_events: dict[str, int] = defaultdict(int)
    all_ips: set[str] = set()

    times: list[datetime] = []

    for ev in events:
        level = (ev.level or "Information").strip() or "Information"
        level_counts[level] += 1
        if ev.source:
            source_counts[ev.source] += 1
        if ev.event_id is not None:
            event_id_counts[ev.event_id] += 1

        acct = extract_account(ev)
        if acct:
            account_counts[acct] += 1

        for ip in extract_ips_from_event(ev):
            all_ips.add(ip)
            ip_events[ip] += 1

        pt = ev.parsed_time
        if pt:
            times.append(pt)
            bucket = pt.strftime("%Y-%m-%d %H:00")
            timeline_buckets[bucket][level] += 1

        # Attacker / notable actions
        if ev.event_id == 4625:
            failed_by_account[acct or "unknown"] += 1
            ips = extract_ips_from_event(ev)
            for ip in ips:
                failed_by_ip[ip] += 1
            attacker_actions.append(
                {
                    "time": ev.timestamp,
                    "action": "فشل تسجيل دخول",
                    "actor": acct or "unknown",
                    "target": ev.computer or extract_logon_type(ev) or "",
                    "severity": "medium",
                    "event_id": 4625,
                }
            )
        elif ev.event_id == 4624:
            logon_type = extract_logon_type(ev)
            if logon_type in ("3", "10", "8"):
                attacker_actions.append(
                    {
                        "time": ev.timestamp,
                        "action": f"تسجيل دخول ناجح (نوع {logon_type})",
                        "actor": acct or "unknown",
                        "target": ev.computer,
                        "severity": "low",
                        "event_id": 4624,
                    }
                )
        elif ev.event_id in (4720, 4722, 4724, 4732):
            attacker_actions.append(
                {
                    "time": ev.timestamp,
                    "action": EVENT_NAMES.get(ev.event_id, f"Event {ev.event_id}"),
                    "actor": acct or "unknown",
                    "target": ev.computer,
                    "severity": "high",
                    "event_id": ev.event_id,
                }
            )
        elif ev.event_id == 4672:
            attacker_actions.append(
                {
                    "time": ev.timestamp,
                    "action": "تعيين صلاحيات خاصة",
                    "actor": acct or "unknown",
                    "target": ev.computer,
                    "severity": "medium",
                    "event_id": 4672,
                }
            )
        elif ev.event_id in (10028, 5719) or (
            ev.event_id == 4 and "Kerberos" in (ev.source or "")
        ):
            attacker_actions.append(
                {
                    "time": ev.timestamp,
                    "action": EVENT_NAMES.get(ev.event_id, ev.source),
                    "actor": ev.source,
                    "target": ev.computer,
                    "severity": "medium",
                    "event_id": ev.event_id,
                }
            )
        elif level.lower() in ("error", "critical") and "threat" in (
            ev.message or ""
        ).lower():
            attacker_actions.append(
                {
                    "time": ev.timestamp,
                    "action": "تهديد مذكور في السجل",
                    "actor": ev.source or "generic",
                    "target": ev.message[:120],
                    "severity": "high",
                    "event_id": ev.event_id,
                }
            )

    # Findings
    for acct, count in failed_by_account.most_common(10):
        if count >= 5:
            findings.append(
                {
                    "severity": "high" if count >= 15 else "medium",
                    "title": f"محاولات فشل تسجيل دخول متكررة: {acct}",
                    "description": f"رُصدت {count} محاولة فاشلة لنفس الحساب — احتمال هجوم تخمين كلمات المرور.",
                    "event_ids": [4625],
                    "count": count,
                    "mitre": MITRE_MAP[4625],
                }
            )

    for ip, count in failed_by_ip.most_common(10):
        if count >= 5:
            findings.append(
                {
                    "severity": "high" if count >= 15 else "medium",
                    "title": f"فشل دخول من عنوان IP: {ip}",
                    "description": f"{count} محاولة فاشلة من نفس المصدر.",
                    "event_ids": [4625],
                    "count": count,
                    "mitre": MITRE_MAP[4625],
                }
            )

    for eid in (4720, 4722, 4724, 4732):
        c = event_id_counts.get(eid, 0)
        if c:
            findings.append(
                {
                    "severity": "high",
                    "title": EVENT_NAMES[eid],
                    "description": f"ظهر الحدث {eid} بعدد {c} — راقب تغييرات الحسابات والمجموعات.",
                    "event_ids": [eid],
                    "count": c,
                    "mitre": MITRE_MAP.get(eid, ""),
                }
            )

    priv = event_id_counts.get(4672, 0)
    if priv >= 3:
        findings.append(
            {
                "severity": "medium",
                "title": "تعيين صلاحيات مرتفعة متكرر",
                "description": f"حدث 4672 ظهر {priv} مرة.",
                "event_ids": [4672],
                "count": priv,
                "mitre": MITRE_MAP[4672],
            }
        )

    for eid in (10028, 5719, 4):
        c = event_id_counts.get(eid, 0)
        if c >= 2:
            findings.append(
                {
                    "severity": "medium",
                    "title": EVENT_NAMES.get(eid, f"Event {eid}"),
                    "description": f"تكرار {c} — قد يشير إلى مشاكل ثقة أو اتصال في النطاق.",
                    "event_ids": [eid],
                    "count": c,
                    "mitre": "",
                }
            )

    errors = sum(
        v
        for k, v in level_counts.items()
        if k.lower() in ("error", "critical", "خطأ")
    )
    if errors >= 20:
        findings.append(
            {
                "severity": "low",
                "title": "كثافة أخطاء مرتفعة",
                "description": f"عدد أحداث الخطأ/الحرج: {errors}.",
                "event_ids": [],
                "count": errors,
                "mitre": "",
            }
        )

    if not findings and events:
        findings.append(
            {
                "severity": "info",
                "title": "لا توجد مؤشرات هجوم واضحة",
                "description": "لم تُرصد أنماط عالية الخطورة وفق القواعد الحالية. راجع المخططات والأنشطة أدناه.",
                "event_ids": [],
                "count": 0,
                "mitre": "",
            }
        )

    severity_order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    findings.sort(key=lambda f: severity_order.get(f["severity"], 9))
    attacker_actions.sort(key=lambda a: a.get("time") or "", reverse=True)

    timeline = []
    for bucket in sorted(timeline_buckets.keys()):
        by_level = dict(timeline_buckets[bucket])
        timeline.append(
            {
                "bucket": bucket,
                "count": sum(by_level.values()),
                "by_level": by_level,
            }
        )

    top_event_ids = [
        {
            "id": eid,
            "count": count,
            "name": EVENT_NAMES.get(eid, f"Event {eid}"),
        }
        for eid, count in event_id_counts.most_common(15)
    ]

    time_range = None
    if times:
        time_range = {
            "start": min(times).isoformat(),
            "end": max(times).isoformat(),
        }

    critical_findings = sum(1 for f in findings if f["severity"] == "high")

    return {
        "summary": {
            "total_events": len(events),
            "errors": errors,
            "warnings": sum(
                v for k, v in level_counts.items() if "warn" in k.lower()
            ),
            "critical_findings": critical_findings,
            "unique_ips": len(all_ips),
            "time_range": time_range,
            "level_counts": dict(level_counts),
        },
        "findings": findings,
        "timeline": timeline,
        "top_event_ids": top_event_ids,
        "top_accounts": [
            {"account": a, "count": c} for a, c in account_counts.most_common(10)
        ],
        "top_sources": [
            {"source": s, "count": c} for s, c in source_counts.most_common(10)
        ],
        "attacker_actions": attacker_actions[:200],
        "ip_counts": dict(ip_events),
        "ips_raw": sorted(all_ips),
    }
