"""Arabic Document Management & Real-time Similarity Engine — API only."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.api.task_routes import router as task_router
from app.api.tip_routes import router as tip_router
from app.api.performance_routes import router as performance_router
from app.api.scan_routes import router as scan_router
from app.api.history_routes import router as history_router
from app.api.log_analyzer_routes import router as log_analyzer_router
from app.api.ticket_routes import router as ticket_router
from app.api.task_group_routes import router as task_group_router
from app.api.assistant_routes import router as assistant_router
from app.api.activity_routes import router as activity_router
from app.core.config import get_settings
from app.core.database import get_app_database

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

settings = get_settings()
settings.ensure_directories()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Local Arabic document ingestion, semantic search, "
        "task management, educational tips, and performance tracking.\n\n"
        "**Normalization policy:** search & matching normalize Arabic; "
        "suggested corrections keep official corpus wording."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(task_router, prefix="/tasks", tags=["tasks"])
app.include_router(task_group_router, prefix="/task-groups", tags=["task-groups"])
app.include_router(ticket_router, prefix="/tickets", tags=["tickets"])
app.include_router(tip_router, prefix="/tips", tags=["tips"])
app.include_router(performance_router, prefix="/performance", tags=["performance"])
app.include_router(scan_router, prefix="/v3", tags=["virus-scan"])
app.include_router(history_router, prefix="/internal/history", tags=["scan-history"])
app.include_router(log_analyzer_router, prefix="/log-analyzer", tags=["log-analyzer"])
app.include_router(assistant_router, prefix="/assistant", tags=["assistant"])
app.include_router(activity_router, prefix="/activity", tags=["activity"])


@app.on_event("startup")
def on_startup() -> None:
    # Ensure new tables (scans, log_reports, role_permissions) exist
    get_app_database()._init_schema()
    db = get_app_database()
    db.ensure_seed_users()
    # Backfill content hashes for older entries (dedupe support)
    try:
        from app.services.ingestion import content_fingerprint

        for entry in db.list_entries(limit=500):
            if entry.content and not entry.content_hash:
                digest = content_fingerprint(entry.content)
                db.upsert_entry(
                    entry_id=entry.id,
                    title=entry.title,
                    entry_type=entry.entry_type,
                    file_type=entry.file_type,
                    content=entry.content,
                    stored_path=entry.stored_path,
                    pages_parsed=entry.pages_parsed,
                    chunks_indexed=entry.chunks_indexed,
                    ocr_pages=entry.ocr_pages,
                    content_hash=digest,
                )
    except Exception:
        logging.getLogger(__name__).exception("content_hash backfill skipped")
    if not db.list_tips(limit=1):
        admin = db.get_user_by_username("admin")
        if admin:
            seeds = [
                (
                    "فعّل المصادقة الثنائية دائماً",
                    "لا تعتمد على كلمة المرور وحدها. فعّل المصادقة الثنائية على كل حساب إداري وخدمات حساسة لتقليل خطر اختراق الحسابات.",
                    "حسابات",
                ),
                (
                    "تحقق قبل النقر على الروابط",
                    "رسائل التصيّد غالباً ما تبدو رسمية. مرّر المؤشر فوق الرابط وتحقق من النطاق قبل فتح أي مرفق أو صفحة تسجيل دخول.",
                    "تصيّد",
                ),
                (
                    "حدّث الأنظمة فور صدور التصحيحات",
                    "الثغرات المعروفة تُستغل بسرعة. طبّق تحديثات الأمان على الخوادم ومحطات العمل ضمن نافذة زمنية واضحة.",
                    "تحديثات",
                ),
            ]
            for title, body, cat in seeds:
                db.create_tip(
                    title=title, body=body, category=cat, author_id=admin.id
                )


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — minimal info in production."""
    return {"status": "ok", "version": settings.app_version}
