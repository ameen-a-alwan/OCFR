"""Helpers to append unified activity / audit log entries."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Request

from app.core.database import UserRecord, get_app_database
from app.core.rate_limit import client_ip

logger = logging.getLogger(__name__)


def log_activity(
    request: Request | None,
    *,
    action: str,
    category: str = "general",
    detail: str = "",
    user: UserRecord | None = None,
    username: str | None = None,
    user_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Record an action.
    - Logged-in: store username (+ optional display) and IP
    - Anonymous: IP only (username left null)
    """
    try:
        ip = ip_address or (client_ip(request) if request is not None else "")
        uname = username
        uid = user_id
        if user is not None:
            uname = user.username
            uid = user.id
        get_app_database().create_activity_log(
            action=action,
            category=category,
            detail=detail,
            username=uname,
            user_id=uid,
            ip_address=ip,
            resource_type=resource_type,
            resource_id=resource_id,
        )
    except Exception:
        logger.exception("Failed to write activity log for %s", action)
