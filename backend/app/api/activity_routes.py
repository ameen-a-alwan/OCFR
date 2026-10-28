"""Unified activity / audit log API."""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.auth import CanReadActivity
from app.core.database import get_app_database

router = APIRouter()


class ActivityLogOut(BaseModel):
    id: str
    created_at: str
    action: str
    category: str
    detail: str
    username: str | None = None
    user_id: str | None = None
    ip_address: str
    resource_type: str | None = None
    resource_id: str | None = None
    actor_label: str


@router.get("")
def list_activity(
    user: CanReadActivity,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    category: str | None = None,
    action: str | None = None,
) -> dict:
    _ = user
    db = get_app_database()
    rows = db.list_activity_logs(
        limit=limit, offset=offset, category=category, action=action
    )
    total = db.count_activity_logs(category=category, action=action)
    items: list[ActivityLogOut] = []
    for r in rows:
        uname = (r.get("username") or "").strip()
        ip = (r.get("ip_address") or "").strip() or "—"
        if uname:
            actor = f"{uname} · {ip}"
        else:
            actor = ip
        items.append(
            ActivityLogOut(
                id=r["id"],
                created_at=r["created_at"],
                action=r["action"],
                category=r["category"],
                detail=r.get("detail") or "",
                username=r.get("username"),
                user_id=r.get("user_id"),
                ip_address=r.get("ip_address") or "",
                resource_type=r.get("resource_type"),
                resource_id=r.get("resource_id"),
                actor_label=actor,
            )
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}
