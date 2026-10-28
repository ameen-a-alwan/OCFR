"""Educational tips board API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.activity import log_activity
from app.core.auth import CanDeleteTips, CanWriteTips, OptionalUser
from app.core.database import get_app_database

router = APIRouter()


class TipCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    body: str = Field(..., min_length=5)
    category: str = Field(default="أمن سيبراني", max_length=80)


class TipOut(BaseModel):
    id: str
    title: str
    body: str
    category: str
    author_id: str
    author_name: str
    created_at: str
    updated_at: str


@router.get("", response_model=list[TipOut])
def list_tips(_user: OptionalUser) -> list[TipOut]:
    tips = get_app_database().list_tips(published_only=True)
    return [
        TipOut(
            id=t.id,
            title=t.title,
            body=t.body,
            category=t.category,
            author_id=t.author_id,
            author_name=t.author_name,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tips
    ]


@router.post("", response_model=TipOut)
def create_tip(body: TipCreate, user: CanWriteTips, request: Request) -> TipOut:
    tip = get_app_database().create_tip(
        title=body.title,
        body=body.body,
        category=body.category,
        author_id=user.id,
    )
    log_activity(
        request,
        action="tip_create",
        category="tips",
        detail=f"نشر نصيحة: {tip.title[:80]}",
        user=user,
        resource_type="tip",
        resource_id=tip.id,
    )
    return TipOut(
        id=tip.id,
        title=tip.title,
        body=tip.body,
        category=tip.category,
        author_id=tip.author_id,
        author_name=tip.author_name,
        created_at=tip.created_at,
        updated_at=tip.updated_at,
    )


@router.delete("/{tip_id}")
def delete_tip(tip_id: str, user: CanDeleteTips, request: Request) -> dict[str, str]:
    db = get_app_database()
    tip = db.get_tip(tip_id)
    if not tip:
        raise HTTPException(status_code=404, detail="النصائح غير موجودة")
    if user.role != "admin" and tip.author_id != user.id:
        raise HTTPException(status_code=403, detail="لا يمكن حذف نصيحة الآخرين")
    db.delete_tip(tip_id)
    log_activity(
        request,
        action="tip_delete",
        category="tips",
        detail=f"حذف نصيحة: {tip.title[:80]}",
        user=user,
        resource_type="tip",
        resource_id=tip_id,
    )
    return {"status": "deleted"}
