"""Task visibility groups — leaders and members."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.activity import log_activity
from app.core.auth import CanManageTaskGroups
from app.core.database import get_app_database

router = APIRouter()


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    leader_id: str
    member_ids: list[str] = Field(default_factory=list)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    leader_id: str | None = None
    member_ids: list[str] | None = None


@router.get("")
def list_groups(user: CanManageTaskGroups) -> list[dict[str, Any]]:
    _ = user
    return get_app_database().list_task_groups()


@router.post("")
def create_group(
    body: GroupCreate, user: CanManageTaskGroups, request: Request
) -> dict[str, Any]:
    db = get_app_database()
    if not db.get_user(body.leader_id):
        raise HTTPException(status_code=400, detail="قائد المجموعة غير موجود")
    for mid in body.member_ids:
        if not db.get_user(mid):
            raise HTTPException(status_code=400, detail="أحد الأعضاء غير موجود")
    group = db.create_task_group(
        name=body.name.strip(),
        leader_id=body.leader_id,
        created_by=user.id,
        member_ids=body.member_ids,
    )
    log_activity(
        request,
        action="task_group_create",
        category="tasks",
        detail=f"إنشاء مجموعة مهام: {body.name.strip()[:80]}",
        user=user,
        resource_type="task_group",
        resource_id=group.get("id"),
    )
    return group


@router.get("/{group_id}")
def get_group(group_id: str, user: CanManageTaskGroups) -> dict[str, Any]:
    _ = user
    group = get_app_database().get_task_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    return group


@router.patch("/{group_id}")
def update_group(
    group_id: str, body: GroupUpdate, user: CanManageTaskGroups, request: Request
) -> dict[str, Any]:
    db = get_app_database()
    if not db.get_task_group(group_id):
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    if body.leader_id and not db.get_user(body.leader_id):
        raise HTTPException(status_code=400, detail="قائد المجموعة غير موجود")
    if body.member_ids is not None:
        for mid in body.member_ids:
            if not db.get_user(mid):
                raise HTTPException(status_code=400, detail="أحد الأعضاء غير موجود")
    updated = db.update_task_group(
        group_id,
        name=body.name.strip() if body.name else None,
        leader_id=body.leader_id,
        member_ids=body.member_ids,
    )
    assert updated
    log_activity(
        request,
        action="task_group_update",
        category="tasks",
        detail="تحديث مجموعة مهام",
        user=user,
        resource_type="task_group",
        resource_id=group_id,
    )
    return updated


@router.delete("/{group_id}")
def delete_group(
    group_id: str, user: CanManageTaskGroups, request: Request
) -> dict[str, str]:
    if not get_app_database().delete_task_group(group_id):
        raise HTTPException(status_code=404, detail="المجموعة غير موجودة")
    log_activity(
        request,
        action="task_group_delete",
        category="tasks",
        detail="حذف مجموعة مهام",
        user=user,
        resource_type="task_group",
        resource_id=group_id,
    )
    return {"status": "deleted"}
