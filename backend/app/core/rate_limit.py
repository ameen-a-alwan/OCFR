"""Simple in-process rate limiter for public endpoints."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class SlidingWindowRateLimiter:
    def __init__(self, *, max_calls: int, window_seconds: float) -> None:
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.max_calls:
                raise HTTPException(
                    status_code=429,
                    detail="تم تجاوز الحد المسموح من الطلبات. حاول لاحقاً.",
                )
            q.append(now)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client:
        return request.client.host
    return "unknown"


# Public ticket submit: 5 / 10 minutes per IP
ticket_submit_limiter = SlidingWindowRateLimiter(max_calls=5, window_seconds=600)

# Public virus scan: 20 / 10 minutes per IP
virus_scan_limiter = SlidingWindowRateLimiter(max_calls=20, window_seconds=600)

# Login: 15 / 5 minutes per IP
login_limiter = SlidingWindowRateLimiter(max_calls=15, window_seconds=300)
