"""JWT auth helpers, permission checks, and FastAPI dependencies."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.database import UserRecord, get_app_database, verify_password
from app.core.permissions import default_permissions_for_role, normalize_permission_set

security = HTTPBearer(auto_error=False)


def create_access_token(*, user_id: str, username: str, role: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc)
        + timedelta(hours=settings.jwt_expire_hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز الدخول غير صالح أو منتهٍ",
        ) from exc


def authenticate_user(username: str, password: str) -> UserRecord:
    db = get_app_database()
    user = db.get_user_by_username(username)
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )
    return user


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
) -> UserRecord:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="يجب تسجيل الدخول",
        )
    payload = decode_token(credentials.credentials)
    user = get_app_database().get_user(payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="المستخدم غير موجود",
        )
    return user


def get_optional_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
) -> UserRecord | None:
    if not credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None


def user_permissions(user: UserRecord) -> set[str]:
    """Resolve effective permissions for a user (DB overrides or defaults)."""
    if user.role == "admin":
        return normalize_permission_set(default_permissions_for_role("admin"))
    db_perms = get_app_database().get_role_permissions(user.role)
    if db_perms is not None:
        return normalize_permission_set(db_perms)
    return normalize_permission_set(default_permissions_for_role(user.role))


def require_roles(*roles: str):
    def checker(user: Annotated[UserRecord, Depends(get_current_user)]) -> UserRecord:
        if user.role not in roles and user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية لهذا الإجراء",
            )
        return user

    return checker


def require_permissions(*needed: str) -> Callable:
    """Require ALL listed permissions (admin bypasses via full grant)."""

    def checker(user: Annotated[UserRecord, Depends(get_current_user)]) -> UserRecord:
        granted = user_permissions(user)
        missing = [p for p in needed if p not in granted]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية لهذا الإجراء",
            )
        return user

    return checker


def require_any_permission(*needed: str) -> Callable:
    """Require at least ONE of the listed permissions."""

    def checker(user: Annotated[UserRecord, Depends(get_current_user)]) -> UserRecord:
        granted = user_permissions(user)
        if not any(p in granted for p in needed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية لهذا الإجراء",
            )
        return user

    return checker


def assert_valid_role(role: str) -> None:
    if not get_app_database().role_exists(role):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="دور غير صالح",
        )


CanWriteTips = Annotated[UserRecord, Depends(require_permissions("tips.write"))]
CanDeleteTips = Annotated[UserRecord, Depends(require_permissions("tips.delete"))]
RequireAdmin = Annotated[UserRecord, Depends(require_roles("admin"))]
CurrentUser = Annotated[UserRecord, Depends(get_current_user)]
OptionalUser = Annotated[UserRecord | None, Depends(get_optional_user)]

CanReadDocuments = Annotated[UserRecord, Depends(require_permissions("documents.read"))]
CanWriteDocuments = Annotated[UserRecord, Depends(require_permissions("documents.write"))]
CanDeleteDocuments = Annotated[UserRecord, Depends(require_permissions("documents.delete"))]
CanScanVirus = Annotated[UserRecord, Depends(require_permissions("virus.scan"))]
CanViewVirusHistory = Annotated[UserRecord, Depends(require_permissions("virus.history"))]
CanAnalyzeLogs = Annotated[UserRecord, Depends(require_permissions("logs.analyze"))]
CanReadLogs = Annotated[UserRecord, Depends(require_permissions("logs.read"))]
CanManageRoles = Annotated[UserRecord, Depends(require_permissions("roles.manage"))]
CanWriteTasks = Annotated[UserRecord, Depends(require_permissions("tasks.write"))]
CanAssignTasks = Annotated[UserRecord, Depends(require_permissions("tasks.assign"))]
CanManageTaskGroups = Annotated[UserRecord, Depends(require_permissions("tasks.groups.manage"))]
CanViewTasks = Annotated[
    UserRecord,
    Depends(
        require_any_permission(
            "tasks.view_all", "tasks.view_own", "tasks.view_group"
        )
    ),
]
CanReadTickets = Annotated[UserRecord, Depends(require_permissions("tickets.read"))]
CanManageTickets = Annotated[UserRecord, Depends(require_permissions("tickets.manage"))]
CanReadPerformance = Annotated[UserRecord, Depends(require_permissions("performance.read"))]
CanReadActivity = Annotated[UserRecord, Depends(require_permissions("activity.read"))]
CanReadUsers = Annotated[UserRecord, Depends(require_permissions("users.read"))]
CanUseAssistant = Annotated[UserRecord, Depends(require_permissions("assistant.chat"))]
