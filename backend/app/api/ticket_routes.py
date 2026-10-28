"""Public ticket submission + authenticated ticket management."""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.activity import log_activity
from app.core.auth import CanManageTickets, CanReadTickets, OptionalUser
from app.core.config import get_settings
from app.core.database import get_app_database
from app.core.rate_limit import client_ip, ticket_submit_limiter
from app.core.security import assert_within_base, safe_filename
from app.services.ingestion import IngestionService
from app.services.parser import SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)

router = APIRouter()

TICKET_STATUSES = {"open", "fixed", "converted"}
MAX_TICKET_FILES = 10
MAX_FILE_MB = 32
# Broader than document ingest: screenshots/logs often accompany security reports
TICKET_ALLOWED_EXT = SUPPORTED_EXTENSIONS | {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".csv",
    ".log",
    ".zip",
}


class TicketStatusUpdate(BaseModel):
    status: str = Field(..., description="open|fixed")


class TicketConvert(BaseModel):
    assigned_to: str | None = None
    priority: str = "high"
    title: str | None = None


def _ticket_dir() -> Path:
    path = get_settings().uploads_dir / "tickets"
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("")
async def submit_ticket(
    request: Request,
    user: OptionalUser,
    submitter_name: str = Form(..., min_length=2, max_length=120),
    workplace: str = Form(..., min_length=2, max_length=200),
    body: str = Form(..., min_length=5, max_length=10000),
    files: list[UploadFile] | None = File(default=None),
) -> dict[str, Any]:
    """Public fire-and-forget ticket submission (no auth)."""
    ticket_submit_limiter.check(f"ticket:{client_ip(request)}")

    uploads = [f for f in (files or []) if f.filename]
    if len(uploads) > MAX_TICKET_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"الحد الأقصى للمرفقات هو {MAX_TICKET_FILES}",
        )

    max_bytes = MAX_FILE_MB * 1024 * 1024
    validated: list[tuple[str, bytes, str | None]] = []
    for upload in uploads:
        safe_name = safe_filename(upload.filename)
        suffix = Path(safe_name).suffix.lower()
        if suffix not in TICKET_ALLOWED_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"نوع المرفق غير مسموح: {suffix or '(بدون امتداد)'}",
            )
        content = await upload.read()
        if not content:
            continue
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"حجم الملف يتجاوز {MAX_FILE_MB} ميغابايت",
            )
        validated.append((safe_name, content, upload.content_type))

    db = get_app_database()
    ticket = db.create_ticket(
        submitter_name=submitter_name.strip()[:120],
        workplace=workplace.strip()[:200],
        body=body.strip()[:10000],
    )
    ticket_folder = _ticket_dir() / ticket["id"]
    ticket_folder.mkdir(parents=True, exist_ok=True)
    for safe_name, content, content_type in validated:
        stored = ticket_folder / f"{uuid.uuid4().hex}_{safe_name}"
        stored.write_bytes(content)
        assert_within_base(stored, _ticket_dir())
        db.add_ticket_file(
            ticket_id=ticket["id"],
            filename=safe_name,
            stored_path=str(stored),
            content_type=content_type,
            size=len(content),
        )
    log_activity(
        request,
        action="ticket_submit",
        category="tickets",
        detail=f"بلاغ أمني من {submitter_name.strip()[:80]} — {workplace.strip()[:80]}",
        user=user,
        resource_type="ticket",
        resource_id=ticket["id"],
    )
    return {
        "status": "ok",
        "message": "تم استلام البلاغ بنجاح. شكراً لتعاونكم.",
    }


@router.get("")
def list_tickets(
    user: CanReadTickets,
    status: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    _ = user
    if status and status not in TICKET_STATUSES:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    return get_app_database().list_tickets(status=status)


@router.get("/counts")
def ticket_counts(user: CanReadTickets) -> dict[str, int]:
    _ = user
    return get_app_database().ticket_status_counts()


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, user: CanReadTickets) -> dict[str, Any]:
    _ = user
    ticket = get_app_database().get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="البلاغ غير موجود")
    return ticket


@router.get("/{ticket_id}/files/{file_id}")
def download_ticket_file(
    ticket_id: str, file_id: str, user: CanReadTickets
) -> FileResponse:
    _ = user
    db = get_app_database()
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="البلاغ غير موجود")
    match = next((f for f in ticket.get("files", []) if f["id"] == file_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    path = assert_within_base(Path(match["stored_path"]), _ticket_dir())
    if not path.exists():
        raise HTTPException(status_code=404, detail="الملف غير موجود على القرص")
    return FileResponse(
        path,
        filename=safe_filename(match["filename"]),
        media_type=match.get("content_type") or "application/octet-stream",
    )


@router.patch("/{ticket_id}/status")
def update_ticket_status(
    ticket_id: str,
    body: TicketStatusUpdate,
    user: CanManageTickets,
    request: Request,
) -> dict[str, Any]:
    if body.status not in {"open", "fixed"}:
        raise HTTPException(status_code=400, detail="الحالة يجب أن تكون open أو fixed")
    db = get_app_database()
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="البلاغ غير موجود")
    if ticket["status"] == "converted":
        raise HTTPException(status_code=400, detail="لا يمكن تعديل بلاغ محوّل لمهمة")
    updated = db.update_ticket_status(
        ticket_id, status=body.status, handled_by=user.id
    )
    assert updated
    log_activity(
        request,
        action="ticket_status",
        category="tickets",
        detail=f"تغيير حالة البلاغ إلى {body.status}",
        user=user,
        resource_type="ticket",
        resource_id=ticket_id,
    )
    return updated


@router.delete("/{ticket_id}")
def delete_ticket(
    ticket_id: str, user: CanManageTickets, request: Request
) -> dict[str, str]:
    db = get_app_database()
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="البلاغ غير موجود")
    paths = db.delete_ticket(ticket_id)
    for p in paths:
        try:
            Path(p).unlink(missing_ok=True)
        except OSError:
            pass
    folder = _ticket_dir() / ticket_id
    if folder.exists():
        try:
            assert_within_base(folder, _ticket_dir())
            shutil.rmtree(folder, ignore_errors=True)
        except HTTPException:
            pass
    log_activity(
        request,
        action="ticket_delete",
        category="tickets",
        detail="حذف بلاغ أمني",
        user=user,
        resource_type="ticket",
        resource_id=ticket_id,
    )
    return {"status": "deleted"}


@router.post("/{ticket_id}/convert")
def convert_ticket_to_task(
    ticket_id: str, body: TicketConvert, user: CanManageTickets, request: Request
) -> dict[str, Any]:
    db = get_app_database()
    ticket = db.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="البلاغ غير موجود")
    if ticket["status"] == "converted":
        raise HTTPException(status_code=400, detail="تم تحويل هذا البلاغ مسبقاً")

    assignee = body.assigned_to or user.id
    target = db.get_user(assignee)
    if not target:
        raise HTTPException(status_code=400, detail="المستخدم المعيّن غير موجود")

    title = (body.title or "").strip() or (
        f"بلاغ أمني — {ticket['submitter_name']} ({ticket['workplace']})"
    )
    description = (
        f"مُبلِّغ: {ticket['submitter_name']}\n"
        f"جهة العمل: {ticket['workplace']}\n\n"
        f"{ticket['body']}"
    )
    priority = (
        body.priority if body.priority in {"low", "medium", "high", "critical"} else "high"
    )

    task = db.create_task(
        title=title[:200],
        description=description,
        priority=priority,
        created_by=user.id,
        assigned_to=assignee,
        due_date=None,
    )

    for fmeta in ticket.get("files", []):
        src = Path(fmeta["stored_path"])
        try:
            src = assert_within_base(src, _ticket_dir())
        except HTTPException:
            continue
        if not src.exists():
            continue
        suffix = src.suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            continue
        try:
            result = IngestionService().ingest_file(src, copy_to_uploads=True)
            db.add_task_file(
                task_id=task.id,
                uploader_id=user.id,
                entry_id=result.source_id,
                filename=safe_filename(fmeta["filename"]),
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to attach ticket file %s to task", fmeta["filename"])

    updated = db.mark_ticket_converted(
        ticket_id, task_id=task.id, handled_by=user.id
    )
    log_activity(
        request,
        action="ticket_convert",
        category="tickets",
        detail=f"تحويل بلاغ إلى مهمة: {task.title[:80]}",
        user=user,
        resource_type="ticket",
        resource_id=ticket_id,
    )
    return {
        "ticket": updated,
        "task": {
            "id": task.id,
            "title": task.title,
            "assigned_to": task.assigned_to,
            "assigned_to_name": task.assigned_to_name,
        },
    }
