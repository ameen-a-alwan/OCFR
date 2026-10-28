"""Parse Windows Event Viewer TSV exports and generic text logs."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


IP_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
)
ACCOUNT_RE = re.compile(
    r"(?:Account Name|Account Name:|Subject:\s*\n\s*Security ID:.*?\n\s*Account Name:\s*)([^\r\n\\]+)",
    re.IGNORECASE | re.DOTALL,
)
SIMPLE_ACCOUNT_RE = re.compile(
    r"Account Name:\s*([^\r\n]+)", re.IGNORECASE
)
LOGON_TYPE_RE = re.compile(r"Logon Type:\s*(\d+)", re.IGNORECASE)
SOURCE_IP_RE = re.compile(
    r"(?:Source Network Address|Source Address|Client Address|IpAddress):\s*([^\r\n\s]+)",
    re.IGNORECASE,
)


@dataclass
class LogEvent:
    level: str = ""
    keywords: str = ""
    timestamp: str = ""
    source: str = ""
    event_id: int | None = None
    task_category: str = ""
    computer: str = ""
    message: str = ""
    raw: dict[str, str] = field(default_factory=dict)

    @property
    def parsed_time(self) -> datetime | None:
        if not self.timestamp:
            return None
        for fmt in (
            "%m/%d/%Y %I:%M:%S %p",
            "%m/%d/%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ):
            try:
                return datetime.strptime(self.timestamp.strip().split(".")[0], fmt)
            except ValueError:
                continue
        return None


def _decode_bytes(data: bytes) -> str:
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        return data.decode("utf-16")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")
    for enc in ("utf-8", "utf-16", "cp1256", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _normalize_header(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


HEADER_MAP = {
    "level": "level",
    "keywords": "keywords",
    "date and time": "timestamp",
    "date": "timestamp",
    "time": "timestamp",
    "source": "source",
    "event id": "event_id",
    "eventid": "event_id",
    "task category": "task_category",
    "computer": "computer",
    "message": "message",
    "user": "user",
}


def parse_windows_event_tsv(text: str) -> list[LogEvent]:
    """Parse Event Viewer exported TSV (tab-separated, quoted multiline fields)."""
    sample = text[:4096]
    if "\t" not in sample and "," in sample.split("\n", 1)[0]:
        delimiter = ","
    else:
        delimiter = "\t"

    reader = csv.reader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    try:
        headers = next(reader)
    except StopIteration:
        return []

    norm_headers = [_normalize_header(h) for h in headers]
    mapped = [HEADER_MAP.get(h, h) for h in norm_headers]

    # If no recognizable Event Viewer headers, fall back to line parser
    if "event_id" not in mapped and "level" not in mapped:
        return parse_generic_lines(text)

    events: list[LogEvent] = []
    for row in reader:
        if not row or all(not c.strip() for c in row):
            continue
        raw: dict[str, str] = {}
        for i, key in enumerate(mapped):
            if i < len(row):
                raw[key] = row[i].strip()

        event_id = None
        eid_raw = raw.get("event_id", "")
        if eid_raw.isdigit():
            event_id = int(eid_raw)

        # Message may be last column or embedded; join leftover if needed
        message = raw.get("message", "")
        if not message and len(row) > len(mapped):
            message = "\n".join(row[len(mapped) :])
        # Often the last field after known columns holds the message
        if not message and row:
            # Heuristic: longest field is message
            message = max(row, key=len)

        events.append(
            LogEvent(
                level=raw.get("level", ""),
                keywords=raw.get("keywords", ""),
                timestamp=raw.get("timestamp", ""),
                source=raw.get("source", ""),
                event_id=event_id,
                task_category=raw.get("task_category", ""),
                computer=raw.get("computer", ""),
                message=message,
                raw=raw,
            )
        )
    return events


def parse_generic_lines(text: str) -> list[LogEvent]:
    """Fallback for plain / Malwarebytes-style text logs."""
    events: list[LogEvent] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        level = "Information"
        lower = line.lower()
        if "error" in lower or "threat" in lower or "malware" in lower:
            level = "Error"
        elif "warn" in lower:
            level = "Warning"
        elif "critical" in lower or "fatal" in lower:
            level = "Critical"

        events.append(
            LogEvent(
                level=level,
                timestamp="",
                source="generic",
                message=line,
                raw={"line": line},
            )
        )
    return events


def parse_log_bytes(data: bytes) -> list[LogEvent]:
    text = _decode_bytes(data)
    return parse_windows_event_tsv(text)


def extract_ips_from_event(event: LogEvent) -> list[str]:
    ips: list[str] = []
    blob = f"{event.message}\n{event.computer}"
    m = SOURCE_IP_RE.search(event.message)
    if m:
        candidate = m.group(1).strip()
        if IP_RE.fullmatch(candidate):
            ips.append(candidate)
    for ip in IP_RE.findall(blob):
        if ip.startswith("0.") or ip.startswith("127.") or ip == "255.255.255.255":
            continue
        if ip not in ips:
            ips.append(ip)
    return ips


def extract_account(event: LogEvent) -> str | None:
    m = SIMPLE_ACCOUNT_RE.search(event.message)
    if m:
        name = m.group(1).strip().strip('"')
        if name and name not in ("-", "System", "LOCAL SERVICE", "NETWORK SERVICE"):
            return name
    return event.raw.get("user") or None


def extract_logon_type(event: LogEvent) -> str | None:
    m = LOGON_TYPE_RE.search(event.message)
    return m.group(1) if m else None


def event_to_dict(event: LogEvent) -> dict[str, Any]:
    return {
        "level": event.level,
        "keywords": event.keywords,
        "timestamp": event.timestamp,
        "source": event.source,
        "event_id": event.event_id,
        "task_category": event.task_category,
        "computer": event.computer,
        "message": event.message[:2000],
    }
