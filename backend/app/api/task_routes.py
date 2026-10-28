"""Task management API — list, detail, comments, file uploads."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.core.activity import log_activity
from app.core.auth import (
    CanAssignTasks,
    CanViewTasks,
    CanWriteTasks,
    user_permissions,
)
from app.core.database import TaskRecord, UserRecord, get_app_database
from app.core.security import safe_filename
from app.services.ingestion import IngestionService
from app.services.parser import SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)

router = APIRouter()

PRIORITIES = {"low", "medium", "high", "critical"}
STATUSES = {"todo", "in_progress", "done", "cancelled"}


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: str = ""
    priority: str = "medium"
    assigned_to: str | None = None
    due_date: str | None = None


class TaskStatusUpdate(BaseModel):
    status: str


class TaskTransfer(BaseModel):
    assigned_to: str


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    parent_id: str | None = None


class TaskOut(BaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    created_by: str
    created_by_name: str
    assigned_to: str | None
    assigned_to_name: str | None
    due_date: str | None
    completed_at: str | None
    created_at: str
    updated_at: str


def _task_out(t: TaskRecord) -> TaskOut:
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        created_by=t.created_by,
        created_by_name=t.created_by_name,
        assigned_to=t.assigned_to,
        assigned_to_name=t.assigned_to_name,
        due_date=t.due_date,
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _visibility_flags(user: UserRecord) -> tuple[bool, bool, bool]:
    perms = user_permissions(user)
    return (
        "tasks.view_all" in perms,
        "tasks.view_own" in perms,
        "tasks.view_group" in perms,
    )


def _require_visible_task(user: UserRecord, task_id: str) -> TaskRecord:
    db = get_app_database()
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    view_all, view_own, view_group = _visibility_flags(user)
    if not db.user_can_see_task(
        task,
        user_id=user.id,
        view_all=view_all,
        view_own=view_own,
        view_group=view_group,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية لعرض هذه المهمة",
        )
    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(
    user: CanViewTasks,
    status: str | None = Query(default=None),
    mine: bool = Query(default=False),
) -> list[TaskOut]:
    view_all, view_own, view_group = _visibility_flags(user)
    db = get_app_database()
    allowed = db.visible_task_ids_for_user(
        user_id=user.id,
        view_all=view_all,
        view_own=view_own,
        view_group=view_group,
    )
    assigned = user.id if mine else None
    tasks = db.list_tasks(status=status, assigned_to=assigned, task_ids=allowed)
    return [_task_out(t) for t in tasks]


@router.post("", response_model=TaskOut)
def create_task(body: TaskCreate, user: CanWriteTasks, request: Request) -> TaskOut:
    if body.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="أولوية غير صالحة")
    db = get_app_database()
    if body.assigned_to:
        target = db.get_user(body.assigned_to)
        if not target:
            raise HTTPException(status_code=400, detail="المستخدم المعيّن غير موجود")
        # Assigning to someone else requires tasks.assign
        if body.assigned_to != user.id and "tasks.assign" not in user_permissions(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية إسناد المهام للآخرين",
            )
    task = db.create_task(
        title=body.title,
        description=body.description,
        priority=body.priority,
        created_by=user.id,
        assigned_to=body.assigned_to or user.id,
        due_date=body.due_date,
    )
    log_activity(
        request,
        action="task_create",
        category="tasks",
        detail=f"إنشاء مهمة: {task.title[:80]}",
        user=user,
        resource_type="task",
        resource_id=task.id,
    )
    return _task_out(task)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, user: CanViewTasks) -> TaskOut:
    return _task_out(_require_visible_task(user, task_id))


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_status(
    task_id: str, body: TaskStatusUpdate, user: CanWriteTasks, request: Request
) -> TaskOut:
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    _require_visible_task(user, task_id)
    updated = get_app_database().update_task_status(
        task_id, status=body.status, actor_id=user.id
    )
    assert updated
    log_activity(
        request,
        action="task_status",
        category="tasks",
        detail=f"تغيير حالة المهمة إلى {body.status}",
        user=user,
        resource_type="task",
        resource_id=task_id,
    )
    return _task_out(updated)


@router.post("/{task_id}/transfer", response_model=TaskOut)
def transfer(
    task_id: str, body: TaskTransfer, user: CanAssignTasks, request: Request
) -> TaskOut:
    _require_visible_task(user, task_id)
    db = get_app_database()
    target = db.get_user(body.assigned_to)
    if not target:
        raise HTTPException(status_code=400, detail="المستخدم الهدف غير موجود")
    updated = db.transfer_task(task_id, to_user_id=body.assigned_to, actor_id=user.id)
    assert updated
    log_activity(
        request,
        action="task_transfer",
        category="tasks",
        detail=f"نقل المهمة إلى {target.username}",
        user=user,
        resource_type="task",
        resource_id=task_id,
    )
    return _task_out(updated)


@router.get("/{task_id}/events")
def task_events(task_id: str, user: CanViewTasks) -> list[dict[str, Any]]:
    _require_visible_task(user, task_id)
    return get_app_database().list_task_events(task_id)


@router.get("/{task_id}/comments")
def list_comments(task_id: str, user: CanViewTasks) -> list[dict[str, Any]]:
    _require_visible_task(user, task_id)
    comments = get_app_database().list_comments(task_id)
    for c in comments:
        c["is_system"] = bool(c.get("is_system"))
    return comments


@router.post("/{task_id}/comments")
def add_comment(
    task_id: str, body: CommentCreate, user: CanWriteTasks
) -> dict[str, Any]:
    _require_visible_task(user, task_id)
    try:
        comment = get_app_database().add_comment(
            task_id=task_id,
            author_id=user.id,
            body=body.body.strip(),
            parent_id=body.parent_id,
        )
        comment["is_system"] = bool(comment.get("is_system"))
        return comment
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{task_id}/files")
def list_files(task_id: str, user: CanViewTasks) -> list[dict[str, Any]]:
    _require_visible_task(user, task_id)
    return get_app_database().list_task_files(task_id)


@router.post("/{task_id}/files")
async def upload_task_file(
    task_id: str,
    user: CanWriteTasks,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload a file to a task and index it into the document search engine."""
    _require_visible_task(user, task_id)
    db = get_app_database()

    filename = safe_filename(file.filename, default="upload.bin")
    suffix = Path(filename).suffix.lower()
    if suffix in {".db", ".sqlite", ".sqlite3"}:
        raise HTTPException(status_code=400, detail="رفع قواعد البيانات غير مسموح")
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"نوع الملف غير مدعوم. المسموح: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".bin") as tmp:
            tmp_path = Path(tmp.name)
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="الملف فارغ")
            tmp.write(content)

        # Keep temp under system temp; never rename with user-controlled path segments
        labeled = tmp_path.with_name(f"{tmp_path.stem}_{filename}")
        if labeled.exists():
            labeled.unlink()
        tmp_path.rename(labeled)
        tmp_path = labeled

        result = IngestionService().ingest_file(tmp_path, copy_to_uploads=True)
        record = db.add_task_file(
            task_id=task_id,
            uploader_id=user.id,
            entry_id=result.source_id,
            filename=result.filename,
        )
        return {
            **record,
            "chunks_indexed": result.chunks_indexed,
            "source_id": result.source_id,
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Task file upload failed")
        raise HTTPException(status_code=500, detail=f"فشل رفع الملف: {exc}") from exc
    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
