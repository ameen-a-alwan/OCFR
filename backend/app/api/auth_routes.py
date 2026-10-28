"""Auth + admin user management + roles/permissions endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.auth import (
    CanManageRoles,
    CanReadUsers,
    CurrentUser,
    RequireAdmin,
    assert_valid_role,
    authenticate_user,
    create_access_token,
    user_permissions,
)
from app.core.activity import log_activity
from app.core.database import get_app_database
from app.core.permissions import (
    PERMISSIONS,
    default_permissions_for_role,
    normalize_permission_set,
    permission_catalog,
)
from app.core.rate_limit import client_ip, login_limiter

router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    id: str
    username: str
    display_name: str
    role: str
    is_active: bool = True
    permissions: list[str] = []


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    display_name: str = Field(..., min_length=2, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="admin")


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = None
    is_active: bool | None = None


class PasswordUpdate(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class RolePermissionsUpdate(BaseModel):
    permissions: list[str] = Field(default_factory=list)


class RoleCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    label: str = Field(..., min_length=2, max_length=80)
    permissions: list[str] = Field(default_factory=list)


def _user_out(u, *, with_perms: bool = False) -> UserOut:
    perms: list[str] = []
    if with_perms:
        perms = sorted(user_permissions(u))
    return UserOut(
        id=u.id,
        username=u.username,
        display_name=u.display_name,
        role=u.role,
        is_active=u.is_active,
        permissions=perms,
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request) -> LoginResponse:
    login_limiter.check(f"login:{client_ip(request)}")
    ip = client_ip(request)
    try:
        user = authenticate_user(body.username, body.password)
    except HTTPException:
        log_activity(
            request,
            action="login_failed",
            category="auth",
            detail=f"محاولة دخول فاشلة للمستخدم: {body.username.strip()[:64]}",
            username=body.username.strip()[:64] or None,
            ip_address=ip,
        )
        raise
    token = create_access_token(
        user_id=user.id, username=user.username, role=user.role
    )
    log_activity(
        request,
        action="login_success",
        category="auth",
        detail="تسجيل دخول ناجح",
        user=user,
        ip_address=ip,
    )
    return LoginResponse(access_token=token, user=_user_out(user, with_perms=True))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return _user_out(user, with_perms=True)


@router.get("/permissions/catalog")
def permissions_catalog_endpoint(user: CanManageRoles) -> dict:
    _ = user
    db = get_app_database()
    return {
        "permissions": permission_catalog(),
        "roles": [
            {"code": r["code"], "label": r["label"], "is_system": r["is_system"]}
            for r in db.list_defined_roles()
        ],
    }


@router.get("/roles")
def list_roles(admin: CanManageRoles) -> dict:
    _ = admin
    db = get_app_database()
    mapping = db.list_role_permission_map()
    defined = db.list_defined_roles()
    return {
        "roles": [
            {
                "role": r["code"],
                "label": r["label"],
                "permissions": mapping.get(r["code"], []),
                "is_system": r["is_system"],
                "is_custom": not r["is_system"]
                or db.get_role_permissions(r["code"]) is not None,
                "defaults": sorted(default_permissions_for_role(r["code"])),
            }
            for r in defined
        ],
        "catalog": permission_catalog(),
    }


@router.post("/roles")
def create_role(body: RoleCreate, admin: CanManageRoles, request: Request) -> dict:
    _ = admin
    db = get_app_database()
    try:
        role = db.create_role(code=body.code, label=body.label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    perms = set(body.permissions) if body.permissions else default_permissions_for_role(
        role["code"]
    )
    unknown = [p for p in perms if p not in PERMISSIONS]
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"صلاحيات غير معروفة: {', '.join(unknown)}"
        )
    # Never grant roles.manage / users.manage unless explicitly chosen
    db.set_role_permissions(role["code"], perms)
    log_activity(
        request,
        action="role_create",
        category="roles",
        detail=f"إنشاء دور: {role['code']}",
        user=admin,
        resource_type="role",
        resource_id=role["code"],
    )
    return {
        "role": role["code"],
        "label": role["label"],
        "permissions": sorted(perms),
        "message": "تم إنشاء الدور",
    }


@router.delete("/roles/{role}")
def delete_role(role: str, admin: CanManageRoles, request: Request) -> dict:
    _ = admin
    try:
        get_app_database().delete_role(role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_activity(
        request,
        action="role_delete",
        category="roles",
        detail=f"حذف دور: {role}",
        user=admin,
        resource_type="role",
        resource_id=role,
    )
    return {"status": "deleted", "role": role}


@router.put("/roles/{role}/permissions")
def update_role_permissions(
    role: str, body: RolePermissionsUpdate, admin: CanManageRoles, request: Request
) -> dict:
    _ = admin
    assert_valid_role(role)
    if role == "admin":
        perms = set(PERMISSIONS.keys())
    else:
        unknown = [p for p in body.permissions if p not in PERMISSIONS]
        if unknown:
            raise HTTPException(
                status_code=400, detail=f"صلاحيات غير معروفة: {', '.join(unknown)}"
            )
        perms = normalize_permission_set(body.permissions)
        if not perms:
            raise HTTPException(
                status_code=400, detail="يجب اختيار صلاحية واحدة على الأقل"
            )
    get_app_database().set_role_permissions(role, perms)
    log_activity(
        request,
        action="role_permissions_update",
        category="roles",
        detail=f"تحديث صلاحيات الدور: {role}",
        user=admin,
        resource_type="role",
        resource_id=role,
    )
    return {
        "role": role,
        "permissions": sorted(perms),
        "message": "تم تحديث صلاحيات الدور",
    }


@router.post("/roles/{role}/reset")
def reset_role_permissions(role: str, admin: CanManageRoles, request: Request) -> dict:
    _ = admin
    assert_valid_role(role)
    db = get_app_database()
    info = db.get_role(role)
    with db._connect() as conn:
        conn.execute("DELETE FROM role_permissions WHERE role = ?", (role,))
    if info and not info["is_system"]:
        # Custom roles: clear stored overrides (baseline is empty until customized)
        perms = default_permissions_for_role(role)
        db.set_role_permissions(role, perms)
    else:
        perms = default_permissions_for_role(role)
    log_activity(
        request,
        action="role_permissions_reset",
        category="roles",
        detail=f"إعادة صلاحيات الدور للافتراضي: {role}",
        user=admin,
        resource_type="role",
        resource_id=role,
    )
    return {
        "role": role,
        "permissions": sorted(perms),
        "message": "تمت إعادة الصلاحيات للافتراضي",
    }


@router.get("/users", response_model=list[UserOut])
def list_users(user: CanReadUsers) -> list[UserOut]:
    include_inactive = user.role == "admin"
    return [
        _user_out(u)
        for u in get_app_database().list_users(include_inactive=include_inactive)
    ]


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, admin: RequireAdmin, request: Request) -> UserOut:
    _ = admin
    assert_valid_role(body.role)
    try:
        user = get_app_database().create_user(
            username=body.username.strip(),
            display_name=body.display_name.strip(),
            password=body.password,
            role=body.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_activity(
        request,
        action="user_create",
        category="users",
        detail=f"إنشاء مستخدم: {user.username} ({user.role})",
        user=admin,
        resource_type="user",
        resource_id=user.id,
    )
    return _user_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, body: UserUpdate, admin: RequireAdmin, request: Request
) -> UserOut:
    _ = admin
    if body.role is not None:
        assert_valid_role(body.role)
    try:
        user = get_app_database().update_user(
            user_id,
            display_name=body.display_name,
            role=body.role,
            is_active=body.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    log_activity(
        request,
        action="user_update",
        category="users",
        detail=f"تحديث مستخدم: {user.username}",
        user=admin,
        resource_type="user",
        resource_id=user.id,
    )
    return _user_out(user)


@router.post("/users/{user_id}/password")
def set_password(
    user_id: str, body: PasswordUpdate, admin: RequireAdmin, request: Request
) -> dict[str, str]:
    _ = admin
    target = get_app_database().get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    get_app_database().set_password(user_id, body.password)
    log_activity(
        request,
        action="user_password_reset",
        category="users",
        detail=f"تغيير كلمة مرور: {target.username}",
        user=admin,
        resource_type="user",
        resource_id=user_id,
    )
    return {"status": "updated"}
