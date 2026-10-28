"""Role-based permissions registry for OCFR."""

from __future__ import annotations

from typing import Iterable

# Permission codes used across API + frontend
PERMISSIONS: dict[str, str] = {
    "documents.read": "عرض وبحث وفتح الوثائق",
    "documents.write": "رفع وحفظ الوثائق",
    "documents.delete": "حذف الوثائق",
    "virus.scan": "فحص الملفات والروابط",
    "virus.history": "عرض سجل الفحوصات",
    "logs.analyze": "تحليل السجلات",
    "logs.read": "عرض تقارير السجلات",
    # Task visibility & actions
    "tasks.view_all": "عرض كل المهام",
    "tasks.view_own": "عرض المهام التي أنشأها أو أُسندت إليه فقط",
    "tasks.view_group": "عرض مهام أعضاء المجموعات التي يقودها",
    "tasks.write": "إنشاء وتعديل المهام والتعليق عليها",
    "tasks.assign": "إعادة إسناد ونقل المهام",
    "tasks.groups.manage": "إدارة مجموعات المهام وتعيين القادة",
    # Legacy alias kept for migration / old UI labels
    "tasks.read": "عرض المهام (قديم — يُعامل كـ view_own)",
    "tickets.read": "عرض البلاغات الأمنية",
    "tickets.manage": "إدارة البلاغات (إصلاح / حذف / تحويل لمهمة)",
    "tips.read": "عرض النصائح",
    "tips.write": "كتابة النصائح",
    "tips.delete": "حذف النصائح",
    "performance.read": "عرض الأداء",
    "activity.read": "عرض سجل العمليات",
    "assistant.chat": "استخدام المساعد الذكي للأمن السيبراني والذكاء الاصطناعي",
    "users.read": "عرض المستخدمين",
    "users.manage": "إدارة المستخدمين",
    "roles.manage": "إدارة الأدوار والصلاحيات",
}

# Built-in role defaults (admin always has everything)
DEFAULT_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": set(PERMISSIONS.keys()),
}

SYSTEM_ROLES = ("admin",)
# Kept for backward-compatible imports
VALID_ROLES = SYSTEM_ROLES

# Permissions shown in the roles UI (hide legacy alias + temporarily hidden docs)
CATALOG_HIDE = {"tasks.read", "documents.read", "documents.write", "documents.delete"}

# Baseline for newly created custom roles (empty until customized)
CUSTOM_ROLE_BASELINE: set[str] = set()


def default_permissions_for_role(role: str) -> set[str]:
    if role == "admin":
        return set(PERMISSIONS.keys())
    if role in DEFAULT_ROLE_PERMISSIONS:
        return set(DEFAULT_ROLE_PERMISSIONS[role])
    return set(CUSTOM_ROLE_BASELINE)


def permission_catalog() -> list[dict[str, str]]:
    return [
        {"code": code, "label": label}
        for code, label in PERMISSIONS.items()
        if code not in CATALOG_HIDE
    ]


def normalize_permission_set(perms: set[str] | Iterable[str]) -> set[str]:
    """Expand legacy tasks.read into tasks.view_own."""
    out = set(perms)
    if "tasks.read" in out:
        out.add("tasks.view_own")
        out.discard("tasks.read")
    return out
