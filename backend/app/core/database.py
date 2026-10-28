"""Internal SQLite store: documents, users, tasks, tips, performance events."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Iterable, Iterator

from app.core.config import Settings, get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('file', 'text')),
    file_type TEXT NOT NULL,
    content TEXT,
    stored_path TEXT,
    content_hash TEXT,
    pages_parsed INTEGER NOT NULL DEFAULT 0,
    chunks_indexed INTEGER NOT NULL DEFAULT 0,
    ocr_pages INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(entry_type);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS tips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'عام',
    author_id TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tips_created ON tips(created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    created_by TEXT NOT NULL,
    assigned_to TEXT,
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_actor ON task_events(actor_id);

CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (author_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES task_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

CREATE TABLE IF NOT EXISTS task_files (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    uploader_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (uploader_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    submitter_name TEXT NOT NULL,
    workplace TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'fixed', 'converted')),
    converted_task_id TEXT,
    handled_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (handled_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_handled ON tickets(handled_by);

CREATE TABLE IF NOT EXISTS ticket_files (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    content_type TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_files_ticket ON ticket_files(ticket_id);

CREATE TABLE IF NOT EXISTS task_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    leader_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (leader_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_groups_leader ON task_groups(leader_id);

CREATE TABLE IF NOT EXISTS task_group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_group_members_user ON task_group_members(user_id);

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_type TEXT NOT NULL,
    target TEXT NOT NULL,
    analysis_id TEXT,
    status TEXT DEFAULT 'queued',
    verdict TEXT,
    malicious INTEGER DEFAULT 0,
    suspicious INTEGER DEFAULT 0,
    harmless INTEGER DEFAULT 0,
    total_engines INTEGER DEFAULT 0,
    vt_link TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_analysis_id ON scans(analysis_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);

CREATE TABLE IF NOT EXISTS log_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    report_json TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_log_reports_user ON log_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_log_reports_created ON log_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    action TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    detail TEXT NOT NULL DEFAULT '',
    username TEXT,
    user_id TEXT,
    ip_address TEXT NOT NULL DEFAULT '',
    resource_type TEXT,
    resource_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_ip ON activity_logs(ip_address);

CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS roles (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return hmac.compare_digest(candidate.hex(), digest)


@dataclass(frozen=True)
class EntryRecord:
    id: str
    title: str
    entry_type: str
    file_type: str
    content: str | None
    stored_path: str | None
    pages_parsed: int
    chunks_indexed: int
    ocr_pages: int
    created_at: str
    content_hash: str | None = None


@dataclass(frozen=True)
class UserRecord:
    id: str
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: str
    password_hash: str = ""


@dataclass(frozen=True)
class TipRecord:
    id: str
    title: str
    body: str
    category: str
    author_id: str
    author_name: str
    is_published: bool
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class TaskRecord:
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


class AppDatabase:
    """Local SQLite persistence for documents, users, tasks, and tips."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.settings.ensure_directories()
        self.db_path = self.settings.sqlite_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            # Migrate existing DBs that predate content_hash
            cols = {
                row[1] for row in conn.execute("PRAGMA table_info(entries)").fetchall()
            }
            if "content_hash" not in cols:
                conn.execute("ALTER TABLE entries ADD COLUMN content_hash TEXT")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_entries_content_hash ON entries(content_hash)"
            )
            comment_cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(task_comments)").fetchall()
            }
            if comment_cols and "is_system" not in comment_cols:
                conn.execute(
                    "ALTER TABLE task_comments ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0"
                )
            self._migrate_users_role_check(conn)
            self._ensure_system_roles(conn)
            self._migrate_legacy_task_permissions(conn)

    @staticmethod
    def _migrate_legacy_task_permissions(conn: sqlite3.Connection) -> None:
        """Replace legacy tasks.read with tasks.view_own in stored role grants."""
        rows = conn.execute(
            "SELECT role FROM role_permissions WHERE permission = 'tasks.read'"
        ).fetchall()
        for row in rows:
            role = row["role"]
            conn.execute(
                "DELETE FROM role_permissions WHERE role = ? AND permission = 'tasks.read'",
                (role,),
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO role_permissions (role, permission)
                VALUES (?, 'tasks.view_own')
                """,
                (role,),
            )

    @staticmethod
    def _migrate_users_role_check(conn: sqlite3.Connection) -> None:
        """Drop hardcoded role CHECK so custom roles can be assigned."""
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchone()
        if not row or not row["sql"]:
            return
        if "CHECK" not in row["sql"].upper() or "admin" not in row["sql"]:
            return
        conn.execute("PRAGMA foreign_keys = OFF")
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users_new (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                INSERT OR IGNORE INTO users_new
                    (id, username, display_name, password_hash, role, is_active, created_at)
                SELECT id, username, display_name, password_hash, role, is_active, created_at
                FROM users;
                DROP TABLE users;
                ALTER TABLE users_new RENAME TO users;
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                """
            )
        finally:
            conn.execute("PRAGMA foreign_keys = ON")

    @staticmethod
    def _ensure_system_roles(conn: sqlite3.Connection) -> None:
        now = _now()
        conn.execute(
            """
            INSERT OR IGNORE INTO roles (code, label, is_system, created_at)
            VALUES (?, ?, ?, ?)
            """,
            ("admin", "مدير النظام", 1, now),
        )
        # Drop legacy demo roles (editor / member)
        for code in ("editor", "member"):
            conn.execute("DELETE FROM role_permissions WHERE role = ?", (code,))
            conn.execute(
                "DELETE FROM roles WHERE code = ? AND is_system = 1", (code,)
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ── Entries (existing) ──────────────────────────────────────────

    def upsert_entry(
        self,
        *,
        entry_id: str,
        title: str,
        entry_type: str,
        file_type: str,
        content: str | None,
        stored_path: str | None,
        pages_parsed: int,
        chunks_indexed: int,
        ocr_pages: int,
        content_hash: str | None = None,
    ) -> EntryRecord:
        created_at = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO entries (
                    id, title, entry_type, file_type, content, stored_path,
                    content_hash, pages_parsed, chunks_indexed, ocr_pages, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    entry_type=excluded.entry_type,
                    file_type=excluded.file_type,
                    content=excluded.content,
                    stored_path=excluded.stored_path,
                    content_hash=excluded.content_hash,
                    pages_parsed=excluded.pages_parsed,
                    chunks_indexed=excluded.chunks_indexed,
                    ocr_pages=excluded.ocr_pages
                """,
                (
                    entry_id,
                    title,
                    entry_type,
                    file_type,
                    content,
                    stored_path,
                    content_hash,
                    pages_parsed,
                    chunks_indexed,
                    ocr_pages,
                    created_at,
                ),
            )
        return EntryRecord(
            id=entry_id,
            title=title,
            entry_type=entry_type,
            file_type=file_type,
            content=content,
            stored_path=stored_path,
            pages_parsed=pages_parsed,
            chunks_indexed=chunks_indexed,
            ocr_pages=ocr_pages,
            created_at=created_at,
            content_hash=content_hash,
        )

    def list_entries(self, *, limit: int = 100) -> list[EntryRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, entry_type, file_type, content, stored_path,
                       content_hash, pages_parsed, chunks_indexed, ocr_pages, created_at
                FROM entries
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (max(1, min(limit, 500)),),
            ).fetchall()
        return [self._row_to_entry(r) for r in rows]

    def count_entries(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()
        return int(row["n"] if row else 0)

    def get_entry(self, entry_id: str) -> EntryRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, title, entry_type, file_type, content, stored_path,
                       content_hash, pages_parsed, chunks_indexed, ocr_pages, created_at
                FROM entries WHERE id = ?
                """,
                (entry_id,),
            ).fetchone()
        return self._row_to_entry(row) if row else None

    def find_entry_by_content_hash(self, content_hash: str) -> EntryRecord | None:
        if not content_hash:
            return None
        with self._connect() as conn:
            # Prefer original uploaded files over text/db copies
            row = conn.execute(
                """
                SELECT id, title, entry_type, file_type, content, stored_path,
                       content_hash, pages_parsed, chunks_indexed, ocr_pages, created_at
                FROM entries
                WHERE content_hash = ?
                ORDER BY CASE entry_type WHEN 'file' THEN 0 ELSE 1 END, created_at ASC
                LIMIT 1
                """,
                (content_hash,),
            ).fetchone()
        return self._row_to_entry(row) if row else None

    def delete_entry(self, entry_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
            return cur.rowcount > 0

    def get_role_permissions(self, role: str) -> set[str] | None:
        """Return custom permissions if any rows exist for role; else None (= use defaults)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT permission FROM role_permissions WHERE role = ?",
                (role,),
            ).fetchall()
        if not rows:
            return None
        return {r["permission"] for r in rows}

    def set_role_permissions(self, role: str, permissions: Iterable[str]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM role_permissions WHERE role = ?", (role,))
            for perm in sorted(set(permissions)):
                conn.execute(
                    "INSERT INTO role_permissions (role, permission) VALUES (?, ?)",
                    (role, perm),
                )

    def list_defined_roles(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT code, label, is_system, created_at
                FROM roles
                ORDER BY is_system DESC, created_at ASC
                """
            ).fetchall()
        return [
            {
                "code": r["code"],
                "label": r["label"],
                "is_system": bool(r["is_system"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def role_exists(self, code: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM roles WHERE code = ?", (code,)
            ).fetchone()
        return row is not None

    def get_role(self, code: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT code, label, is_system, created_at FROM roles WHERE code = ?",
                (code,),
            ).fetchone()
        if not row:
            return None
        return {
            "code": row["code"],
            "label": row["label"],
            "is_system": bool(row["is_system"]),
            "created_at": row["created_at"],
        }

    def create_role(self, *, code: str, label: str) -> dict[str, Any]:
        code = code.strip().lower()
        label = label.strip()
        if not code or not label:
            raise ValueError("رمز الدور والاسم مطلوبان")
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,31}", code):
            raise ValueError(
                "رمز الدور يجب أن يبدأ بحرف إنجليزي ويحتوي أحرفاً وأرقاماً و_ فقط (2–32)"
            )
        if code == "admin":
            raise ValueError("لا يمكن إنشاء دور admin")
        if self.role_exists(code):
            raise ValueError("الدور موجود مسبقاً")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO roles (code, label, is_system, created_at)
                VALUES (?, ?, 0, ?)
                """,
                (code, label, _now()),
            )
        role = self.get_role(code)
        assert role
        return role

    def delete_role(self, code: str) -> None:
        role = self.get_role(code)
        if not role:
            raise ValueError("الدور غير موجود")
        if role["is_system"]:
            raise ValueError("لا يمكن حذف الأدوار الأساسية")
        with self._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) AS n FROM users WHERE role = ?", (code,)
            ).fetchone()["n"]
            if count:
                raise ValueError(
                    f"لا يمكن الحذف: هناك {count} مستخدم مرتبط بهذا الدور. انقلهم أولاً."
                )
            conn.execute("DELETE FROM role_permissions WHERE role = ?", (code,))
            conn.execute("DELETE FROM roles WHERE code = ?", (code,))

    def list_role_permission_map(self) -> dict[str, list[str]]:
        from app.core.permissions import default_permissions_for_role

        result: dict[str, list[str]] = {}
        for role_info in self.list_defined_roles():
            code = role_info["code"]
            custom = self.get_role_permissions(code)
            perms = custom if custom is not None else default_permissions_for_role(code)
            result[code] = sorted(perms)
        return result

    @staticmethod
    def _row_to_entry(row: sqlite3.Row) -> EntryRecord:
        keys = row.keys()
        return EntryRecord(
            id=row["id"],
            title=row["title"],
            entry_type=row["entry_type"],
            file_type=row["file_type"],
            content=row["content"],
            stored_path=row["stored_path"],
            pages_parsed=int(row["pages_parsed"]),
            chunks_indexed=int(row["chunks_indexed"]),
            ocr_pages=int(row["ocr_pages"]),
            created_at=row["created_at"],
            content_hash=row["content_hash"] if "content_hash" in keys else None,
        )

    # ── Users ───────────────────────────────────────────────────────

    def ensure_seed_users(self) -> None:
        with self._connect() as conn:
            admin = conn.execute(
                "SELECT id FROM users WHERE username = 'admin'"
            ).fetchone()
            if not admin:
                admin_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?)
                    """,
                    (
                        admin_id,
                        "admin",
                        "مدير النظام",
                        hash_password("admin123"),
                        "admin",
                        _now(),
                    ),
                )
            else:
                admin_id = admin["id"]
                # Keep the sole system account as admin role
                conn.execute(
                    "UPDATE users SET role = 'admin', is_active = 1 WHERE id = ?",
                    (admin_id,),
                )

            demos = conn.execute(
                "SELECT id FROM users WHERE username IN ('editor', 'member')"
            ).fetchall()
            for row in demos:
                uid = row["id"]
                # Re-point FK references so demo accounts can be removed
                for sql in (
                    "UPDATE tips SET author_id = ? WHERE author_id = ?",
                    "UPDATE tasks SET created_by = ? WHERE created_by = ?",
                    "UPDATE tasks SET assigned_to = ? WHERE assigned_to = ?",
                    "UPDATE task_events SET actor_id = ? WHERE actor_id = ?",
                    "UPDATE task_comments SET author_id = ? WHERE author_id = ?",
                    "UPDATE task_files SET uploader_id = ? WHERE uploader_id = ?",
                    "UPDATE task_groups SET leader_id = ? WHERE leader_id = ?",
                    "UPDATE task_groups SET created_by = ? WHERE created_by = ?",
                    "UPDATE tickets SET handled_by = ? WHERE handled_by = ?",
                ):
                    try:
                        conn.execute(sql, (admin_id, uid))
                    except sqlite3.OperationalError:
                        pass
                conn.execute(
                    "DELETE FROM task_group_members WHERE user_id = ?", (uid,)
                )
                try:
                    conn.execute("DELETE FROM log_reports WHERE user_id = ?", (uid,))
                except sqlite3.OperationalError:
                    pass
                conn.execute("DELETE FROM users WHERE id = ?", (uid,))

    def get_user_by_username(self, username: str) -> UserRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user(self, user_id: str) -> UserRecord | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._row_to_user(row) if row else None

    def list_users(self, *, include_inactive: bool = False) -> list[UserRecord]:
        with self._connect() as conn:
            if include_inactive:
                rows = conn.execute(
                    "SELECT * FROM users ORDER BY display_name"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM users WHERE is_active = 1 ORDER BY display_name"
                ).fetchall()
        return [self._row_to_user(r) for r in rows]

    def create_user(
        self,
        *,
        username: str,
        display_name: str,
        password: str,
        role: str,
    ) -> UserRecord:
        if not self.role_exists(role):
            raise ValueError("دور غير صالح")
        if self.get_user_by_username(username):
            raise ValueError("اسم المستخدم مستخدم مسبقاً")
        user_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users (id, username, display_name, password_hash, role, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (user_id, username, display_name, hash_password(password), role, _now()),
            )
        user = self.get_user(user_id)
        assert user
        return user

    def update_user(
        self,
        user_id: str,
        *,
        display_name: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> UserRecord | None:
        user = self.get_user(user_id)
        if not user:
            return None
        if role is not None and not self.role_exists(role):
            raise ValueError("دور غير صالح")
        new_name = display_name if display_name is not None else user.display_name
        new_role = role if role is not None else user.role
        new_active = int(is_active) if is_active is not None else int(user.is_active)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE users SET display_name = ?, role = ?, is_active = ?
                WHERE id = ?
                """,
                (new_name, new_role, new_active, user_id),
            )
        return self.get_user(user_id)

    def set_password(self, user_id: str, password: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(password), user_id),
            )
            return cur.rowcount > 0

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> UserRecord:
        return UserRecord(
            id=row["id"],
            username=row["username"],
            display_name=row["display_name"],
            role=row["role"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            password_hash=row["password_hash"],
        )

    # ── Tips ────────────────────────────────────────────────────────

    def create_tip(
        self,
        *,
        title: str,
        body: str,
        category: str,
        author_id: str,
    ) -> TipRecord:
        tip_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tips (id, title, body, category, author_id, is_published, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (tip_id, title, body, category, author_id, now, now),
            )
        tip = self.get_tip(tip_id)
        assert tip
        return tip

    def list_tips(self, *, published_only: bool = True, limit: int = 50) -> list[TipRecord]:
        with self._connect() as conn:
            if published_only:
                rows = conn.execute(
                    """
                    SELECT t.*, u.display_name AS author_name
                    FROM tips t JOIN users u ON u.id = t.author_id
                    WHERE t.is_published = 1
                    ORDER BY t.created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT t.*, u.display_name AS author_name
                    FROM tips t JOIN users u ON u.id = t.author_id
                    ORDER BY t.created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        return [self._row_to_tip(r) for r in rows]

    def get_tip(self, tip_id: str) -> TipRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*, u.display_name AS author_name
                FROM tips t JOIN users u ON u.id = t.author_id
                WHERE t.id = ?
                """,
                (tip_id,),
            ).fetchone()
        return self._row_to_tip(row) if row else None

    def delete_tip(self, tip_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM tips WHERE id = ?", (tip_id,))
            return cur.rowcount > 0

    @staticmethod
    def _row_to_tip(row: sqlite3.Row) -> TipRecord:
        return TipRecord(
            id=row["id"],
            title=row["title"],
            body=row["body"],
            category=row["category"],
            author_id=row["author_id"],
            author_name=row["author_name"],
            is_published=bool(row["is_published"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # ── Tasks ───────────────────────────────────────────────────────

    def create_task(
        self,
        *,
        title: str,
        description: str,
        priority: str,
        created_by: str,
        assigned_to: str | None,
        due_date: str | None,
    ) -> TaskRecord:
        task_id = str(uuid.uuid4())
        now = _now()
        creator = self.get_user(created_by)
        assignee = self.get_user(assigned_to) if assigned_to else None
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tasks (
                    id, title, description, status, priority, created_by,
                    assigned_to, due_date, completed_at, created_at, updated_at
                ) VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, NULL, ?, ?)
                """,
                (task_id, title, description, priority, created_by, assigned_to, due_date, now, now),
            )
            conn.execute(
                """
                INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                VALUES (?, ?, ?, 'created', ?, ?)
                """,
                (str(uuid.uuid4()), task_id, created_by, f"إنشاء المهمة: {title}", now),
            )
            if assigned_to:
                target_name = assignee.display_name if assignee else assigned_to
                conn.execute(
                    """
                    INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                    VALUES (?, ?, ?, 'assigned', ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        task_id,
                        created_by,
                        f"تعيين إلى {target_name}",
                        now,
                    ),
                )
                if assigned_to != created_by:
                    creator_name = creator.display_name if creator else created_by
                    body = f"قام {creator_name} بإسناد المهمة إلى {target_name}"
                    conn.execute(
                        """
                        INSERT INTO task_comments
                            (id, task_id, author_id, parent_id, body, is_system, created_at)
                        VALUES (?, ?, ?, NULL, ?, 1, ?)
                        """,
                        (str(uuid.uuid4()), task_id, created_by, body, now),
                    )
        task = self.get_task(task_id)
        assert task
        return task

    def get_task(self, task_id: str) -> TaskRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*,
                       c.display_name AS created_by_name,
                       a.display_name AS assigned_to_name
                FROM tasks t
                JOIN users c ON c.id = t.created_by
                LEFT JOIN users a ON a.id = t.assigned_to
                WHERE t.id = ?
                """,
                (task_id,),
            ).fetchone()
        return self._row_to_task(row) if row else None

    def list_tasks(
        self,
        *,
        status: str | None = None,
        assigned_to: str | None = None,
        task_ids: list[str] | None = None,
        limit: int = 100,
    ) -> list[TaskRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("t.status = ?")
            params.append(status)
        if assigned_to:
            clauses.append("t.assigned_to = ?")
            params.append(assigned_to)
        if task_ids is not None:
            if not task_ids:
                return []
            placeholders = ",".join("?" for _ in task_ids)
            clauses.append(f"t.id IN ({placeholders})")
            params.extend(task_ids)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT t.*,
                       c.display_name AS created_by_name,
                       a.display_name AS assigned_to_name
                FROM tasks t
                JOIN users c ON c.id = t.created_by
                LEFT JOIN users a ON a.id = t.assigned_to
                {where}
                ORDER BY
                    CASE t.priority
                        WHEN 'critical' THEN 0
                        WHEN 'high' THEN 1
                        WHEN 'medium' THEN 2
                        ELSE 3
                    END,
                    t.updated_at DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [self._row_to_task(r) for r in rows]

    def visible_task_ids_for_user(
        self,
        *,
        user_id: str,
        view_all: bool,
        view_own: bool,
        view_group: bool,
    ) -> list[str] | None:
        """Return allowed task ids, or None meaning unrestricted (view_all)."""
        if view_all:
            return None
        if not view_own and not view_group:
            return []
        ids: set[str] = set()
        with self._connect() as conn:
            if view_own:
                rows = conn.execute(
                    """
                    SELECT id FROM tasks
                    WHERE created_by = ? OR assigned_to = ?
                    """,
                    (user_id, user_id),
                ).fetchall()
                ids.update(r["id"] for r in rows)
            if view_group:
                member_rows = conn.execute(
                    """
                    SELECT DISTINCT m.user_id
                    FROM task_groups g
                    JOIN task_group_members m ON m.group_id = g.id
                    WHERE g.leader_id = ?
                    UNION
                    SELECT g.leader_id AS user_id
                    FROM task_groups g
                    WHERE g.leader_id = ?
                    """,
                    (user_id, user_id),
                ).fetchall()
                member_ids = [r["user_id"] for r in member_rows]
                if member_ids:
                    placeholders = ",".join("?" for _ in member_ids)
                    rows = conn.execute(
                        f"""
                        SELECT id FROM tasks
                        WHERE created_by IN ({placeholders})
                           OR assigned_to IN ({placeholders})
                        """,
                        (*member_ids, *member_ids),
                    ).fetchall()
                    ids.update(r["id"] for r in rows)
        return list(ids)

    def user_can_see_task(
        self,
        task: TaskRecord,
        *,
        user_id: str,
        view_all: bool,
        view_own: bool,
        view_group: bool,
    ) -> bool:
        allowed = self.visible_task_ids_for_user(
            user_id=user_id,
            view_all=view_all,
            view_own=view_own,
            view_group=view_group,
        )
        if allowed is None:
            return True
        return task.id in allowed

    def update_task_status(
        self, task_id: str, *, status: str, actor_id: str
    ) -> TaskRecord | None:
        now = _now()
        completed = now if status == "done" else None
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, completed, now, task_id),
            )
            labels = {
                "todo": "قيد الانتظار",
                "in_progress": "قيد التنفيذ",
                "done": "مكتملة",
                "cancelled": "ملغاة",
            }
            conn.execute(
                """
                INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                VALUES (?, ?, ?, 'status_change', ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    task_id,
                    actor_id,
                    f"تغيير الحالة إلى: {labels.get(status, status)}",
                    now,
                ),
            )
        return self.get_task(task_id)

    def transfer_task(
        self, task_id: str, *, to_user_id: str, actor_id: str
    ) -> TaskRecord | None:
        now = _now()
        target = self.get_user(to_user_id)
        actor = self.get_user(actor_id)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE tasks SET assigned_to = ?, updated_at = ?,
                    status = CASE WHEN status = 'todo' THEN 'in_progress' ELSE status END
                WHERE id = ?
                """,
                (to_user_id, now, task_id),
            )
            name = target.display_name if target else to_user_id
            actor_name = actor.display_name if actor else actor_id
            conn.execute(
                """
                INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                VALUES (?, ?, ?, 'transferred', ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    task_id,
                    actor_id,
                    f"نقل المهمة إلى: {name}",
                    now,
                ),
            )
            body = f"قام {actor_name} بنقل المهمة إلى {name}"
            conn.execute(
                """
                INSERT INTO task_comments
                    (id, task_id, author_id, parent_id, body, is_system, created_at)
                VALUES (?, ?, ?, NULL, ?, 1, ?)
                """,
                (str(uuid.uuid4()), task_id, actor_id, body, now),
            )
        return self.get_task(task_id)

    def list_task_events(self, task_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT e.*, u.display_name AS actor_name
                FROM task_events e
                JOIN users u ON u.id = e.actor_id
                WHERE e.task_id = ?
                ORDER BY e.created_at ASC
                """,
                (task_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    @staticmethod
    def _row_to_task(row: sqlite3.Row) -> TaskRecord:
        return TaskRecord(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            status=row["status"],
            priority=row["priority"],
            created_by=row["created_by"],
            created_by_name=row["created_by_name"],
            assigned_to=row["assigned_to"],
            assigned_to_name=row["assigned_to_name"],
            due_date=row["due_date"],
            completed_at=row["completed_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # ── Task comments & files ───────────────────────────────────────

    def add_comment(
        self,
        *,
        task_id: str,
        author_id: str,
        body: str,
        parent_id: str | None = None,
        is_system: bool = False,
    ) -> dict[str, Any]:
        comment_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            if parent_id:
                parent = conn.execute(
                    "SELECT id FROM task_comments WHERE id = ? AND task_id = ?",
                    (parent_id, task_id),
                ).fetchone()
                if not parent:
                    raise ValueError("التعليق الأصلي غير موجود")
            conn.execute(
                """
                INSERT INTO task_comments
                    (id, task_id, author_id, parent_id, body, is_system, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    comment_id,
                    task_id,
                    author_id,
                    parent_id,
                    body,
                    1 if is_system else 0,
                    now,
                ),
            )
            if not is_system:
                conn.execute(
                    """
                    INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                    VALUES (?, ?, ?, 'comment', ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        task_id,
                        author_id,
                        "رد على تعليق" if parent_id else "تعليق جديد",
                        now,
                    ),
                )
            conn.execute(
                "UPDATE tasks SET updated_at = ? WHERE id = ?",
                (now, task_id),
            )
        comments = self.list_comments(task_id)
        return next(c for c in comments if c["id"] == comment_id)

    def list_comments(self, task_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT c.*, u.display_name AS author_name
                FROM task_comments c
                JOIN users u ON u.id = c.author_id
                WHERE c.task_id = ?
                ORDER BY c.created_at ASC
                """,
                (task_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def add_task_file(
        self,
        *,
        task_id: str,
        uploader_id: str,
        entry_id: str,
        filename: str,
    ) -> dict[str, Any]:
        file_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO task_files (id, task_id, uploader_id, entry_id, filename, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (file_id, task_id, uploader_id, entry_id, filename, now),
            )
            conn.execute(
                """
                INSERT INTO task_events (id, task_id, actor_id, event_type, detail, created_at)
                VALUES (?, ?, ?, 'file_upload', ?, ?)
                """,
                (str(uuid.uuid4()), task_id, uploader_id, f"رفع ملف: {filename}", now),
            )
            conn.execute(
                "UPDATE tasks SET updated_at = ? WHERE id = ?",
                (now, task_id),
            )
        files = self.list_task_files(task_id)
        return next(f for f in files if f["id"] == file_id)

    def list_task_files(self, task_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT f.*, u.display_name AS uploader_name
                FROM task_files f
                JOIN users u ON u.id = f.uploader_id
                WHERE f.task_id = ?
                ORDER BY f.created_at DESC
                """,
                (task_id,),
            ).fetchall()
        return [
            {
                **dict(r),
                "open_url": f"/entries/{r['entry_id']}/open",
            }
            for r in rows
        ]

    # ── Performance ─────────────────────────────────────────────────

    @staticmethod
    def _period_start(period: str | None) -> str | None:
        if not period or period == "total":
            return None
        now = datetime.now(timezone.utc)
        mapping = {
            "week": timedelta(days=7),
            "month": timedelta(days=30),
            "year": timedelta(days=365),
        }
        delta = mapping.get(period)
        if not delta:
            return None
        return (now - delta).isoformat()

    def performance_summary(self, *, period: str = "total") -> list[dict[str, Any]]:
        since = self._period_start(period)
        with self._connect() as conn:
            if since:
                rows = conn.execute(
                    """
                    SELECT
                        u.id,
                        u.display_name,
                        u.username,
                        u.role,
                        COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS completed,
                        COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
                        COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS pending,
                        COALESCE(COUNT(t.id), 0) AS assigned_total,
                        (
                            SELECT COUNT(*) FROM task_events te
                            WHERE te.actor_id = u.id
                              AND te.created_at >= ?
                        ) AS actions,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id
                              AND tk.updated_at >= ?
                        ) AS tickets_handled,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id
                              AND tk.status = 'fixed'
                              AND tk.updated_at >= ?
                        ) AS tickets_fixed,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id
                              AND tk.status = 'converted'
                              AND tk.updated_at >= ?
                        ) AS tickets_converted
                    FROM users u
                    LEFT JOIN tasks t ON t.assigned_to = u.id
                        AND t.updated_at >= ?
                    WHERE u.is_active = 1
                    GROUP BY u.id
                    ORDER BY completed DESC, actions DESC
                    """,
                    (since, since, since, since, since),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT
                        u.id,
                        u.display_name,
                        u.username,
                        u.role,
                        COALESCE(SUM(CASE WHEN t.status = 'done' AND t.assigned_to = u.id THEN 1 ELSE 0 END), 0) AS completed,
                        COALESCE(SUM(CASE WHEN t.status = 'in_progress' AND t.assigned_to = u.id THEN 1 ELSE 0 END), 0) AS in_progress,
                        COALESCE(SUM(CASE WHEN t.status = 'todo' AND t.assigned_to = u.id THEN 1 ELSE 0 END), 0) AS pending,
                        COALESCE(SUM(CASE WHEN t.assigned_to = u.id THEN 1 ELSE 0 END), 0) AS assigned_total,
                        (
                            SELECT COUNT(*) FROM task_events te
                            WHERE te.actor_id = u.id
                        ) AS actions,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id
                        ) AS tickets_handled,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id AND tk.status = 'fixed'
                        ) AS tickets_fixed,
                        (
                            SELECT COUNT(*) FROM tickets tk
                            WHERE tk.handled_by = u.id AND tk.status = 'converted'
                        ) AS tickets_converted
                    FROM users u
                    LEFT JOIN tasks t ON t.assigned_to = u.id
                    WHERE u.is_active = 1
                    GROUP BY u.id
                    ORDER BY completed DESC, actions DESC
                    """
                ).fetchall()
        result = []
        for r in rows:
            assigned = int(r["assigned_total"])
            completed = int(r["completed"])
            rate = round((completed / assigned) * 100, 1) if assigned else 0.0
            result.append(
                {
                    "user_id": r["id"],
                    "display_name": r["display_name"],
                    "username": r["username"],
                    "role": r["role"],
                    "completed": completed,
                    "in_progress": int(r["in_progress"]),
                    "pending": int(r["pending"]),
                    "assigned_total": assigned,
                    "actions": int(r["actions"]),
                    "completion_rate": rate,
                    "tickets_handled": int(r["tickets_handled"] or 0),
                    "tickets_fixed": int(r["tickets_fixed"] or 0),
                    "tickets_converted": int(r["tickets_converted"] or 0),
                    "period": period,
                }
            )
        return result

    def ticket_status_counts(self) -> dict[str, int]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT status, COUNT(*) AS cnt
                FROM tickets
                GROUP BY status
                """
            ).fetchall()
        counts = {"open": 0, "fixed": 0, "converted": 0}
        for r in rows:
            counts[r["status"]] = int(r["cnt"])
        return counts

    # ── Tickets ─────────────────────────────────────────────────────

    def create_ticket(
        self,
        *,
        submitter_name: str,
        workplace: str,
        body: str,
    ) -> dict[str, Any]:
        ticket_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tickets (
                    id, submitter_name, workplace, body, status,
                    converted_task_id, handled_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'open', NULL, NULL, ?, ?)
                """,
                (ticket_id, submitter_name, workplace, body, now, now),
            )
        ticket = self.get_ticket(ticket_id)
        assert ticket
        return ticket

    def add_ticket_file(
        self,
        *,
        ticket_id: str,
        filename: str,
        stored_path: str,
        content_type: str | None,
        size: int,
    ) -> dict[str, Any]:
        file_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ticket_files
                    (id, ticket_id, filename, stored_path, content_type, size, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (file_id, ticket_id, filename, stored_path, content_type, size, now),
            )
        files = self.list_ticket_files(ticket_id)
        return next(f for f in files if f["id"] == file_id)

    def get_ticket(self, ticket_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*, u.display_name AS handled_by_name
                FROM tickets t
                LEFT JOIN users u ON u.id = t.handled_by
                WHERE t.id = ?
                """,
                (ticket_id,),
            ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["files"] = self.list_ticket_files(ticket_id)
        return data

    def list_tickets(
        self, *, status: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("t.status = ?")
            params.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT t.*, u.display_name AS handled_by_name
                FROM tickets t
                LEFT JOIN users u ON u.id = t.handled_by
                {where}
                ORDER BY t.created_at DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        result = []
        for r in rows:
            item = dict(r)
            item["files"] = self.list_ticket_files(item["id"])
            result.append(item)
        return result

    def list_ticket_files(self, ticket_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM ticket_files
                WHERE ticket_id = ?
                ORDER BY created_at ASC
                """,
                (ticket_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def update_ticket_status(
        self, ticket_id: str, *, status: str, handled_by: str
    ) -> dict[str, Any] | None:
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE tickets
                SET status = ?, handled_by = ?, updated_at = ?,
                    converted_task_id = CASE
                        WHEN ? != 'converted' THEN NULL
                        ELSE converted_task_id
                    END
                WHERE id = ?
                """,
                (status, handled_by, now, status, ticket_id),
            )
        return self.get_ticket(ticket_id)

    def mark_ticket_converted(
        self, ticket_id: str, *, task_id: str, handled_by: str
    ) -> dict[str, Any] | None:
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE tickets
                SET status = 'converted', converted_task_id = ?,
                    handled_by = ?, updated_at = ?
                WHERE id = ?
                """,
                (task_id, handled_by, now, ticket_id),
            )
        return self.get_ticket(ticket_id)

    def delete_ticket(self, ticket_id: str) -> list[str]:
        """Delete ticket and return stored file paths for cleanup."""
        with self._connect() as conn:
            files = conn.execute(
                "SELECT stored_path FROM ticket_files WHERE ticket_id = ?",
                (ticket_id,),
            ).fetchall()
            paths = [r["stored_path"] for r in files]
            conn.execute("DELETE FROM ticket_files WHERE ticket_id = ?", (ticket_id,))
            conn.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
        return paths

    # ── Task groups ─────────────────────────────────────────────────

    def create_task_group(
        self, *, name: str, leader_id: str, created_by: str, member_ids: list[str] | None = None
    ) -> dict[str, Any]:
        group_id = str(uuid.uuid4())
        now = _now()
        members = set(member_ids or [])
        members.add(leader_id)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO task_groups (id, name, leader_id, created_by, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (group_id, name, leader_id, created_by, now),
            )
            for uid in members:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO task_group_members (group_id, user_id)
                    VALUES (?, ?)
                    """,
                    (group_id, uid),
                )
        group = self.get_task_group(group_id)
        assert group
        return group

    def get_task_group(self, group_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT g.*,
                       l.display_name AS leader_name,
                       c.display_name AS created_by_name
                FROM task_groups g
                JOIN users l ON l.id = g.leader_id
                JOIN users c ON c.id = g.created_by
                WHERE g.id = ?
                """,
                (group_id,),
            ).fetchone()
            if not row:
                return None
            members = conn.execute(
                """
                SELECT u.id, u.username, u.display_name, u.role
                FROM task_group_members m
                JOIN users u ON u.id = m.user_id
                WHERE m.group_id = ?
                ORDER BY u.display_name
                """,
                (group_id,),
            ).fetchall()
        data = dict(row)
        data["members"] = [dict(m) for m in members]
        return data

    def list_task_groups(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT g.*,
                       l.display_name AS leader_name,
                       c.display_name AS created_by_name,
                       (SELECT COUNT(*) FROM task_group_members m WHERE m.group_id = g.id) AS member_count
                FROM task_groups g
                JOIN users l ON l.id = g.leader_id
                JOIN users c ON c.id = g.created_by
                ORDER BY g.created_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def update_task_group(
        self,
        group_id: str,
        *,
        name: str | None = None,
        leader_id: str | None = None,
        member_ids: list[str] | None = None,
    ) -> dict[str, Any] | None:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM task_groups WHERE id = ?", (group_id,)
            ).fetchone()
            if not existing:
                return None
            new_name = name if name is not None else existing["name"]
            new_leader = leader_id if leader_id is not None else existing["leader_id"]
            conn.execute(
                "UPDATE task_groups SET name = ?, leader_id = ? WHERE id = ?",
                (new_name, new_leader, group_id),
            )
            if member_ids is not None:
                members = set(member_ids)
                members.add(new_leader)
                conn.execute(
                    "DELETE FROM task_group_members WHERE group_id = ?", (group_id,)
                )
                for uid in members:
                    conn.execute(
                        """
                        INSERT INTO task_group_members (group_id, user_id)
                        VALUES (?, ?)
                        """,
                        (group_id, uid),
                    )
            elif leader_id is not None:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO task_group_members (group_id, user_id)
                    VALUES (?, ?)
                    """,
                    (group_id, new_leader),
                )
        return self.get_task_group(group_id)

    def delete_task_group(self, group_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM task_groups WHERE id = ?", (group_id,))
            return cur.rowcount > 0

    # --- VirusTotal scan history ---

    def insert_scan(self, scan_type: str, target: str, analysis_id: str) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO scans (scan_type, target, analysis_id, status, created_at)
                VALUES (?, ?, ?, 'queued', ?)
                """,
                (scan_type, target, analysis_id, _now()),
            )
            return int(cur.lastrowid)

    def update_scan(
        self,
        *,
        analysis_id: str,
        verdict: str,
        malicious: int,
        suspicious: int,
        harmless: int,
        total_engines: int,
        vt_link: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE scans
                SET status = 'completed', verdict = ?, malicious = ?, suspicious = ?,
                    harmless = ?, total_engines = ?, vt_link = COALESCE(?, vt_link),
                    completed_at = ?
                WHERE analysis_id = ?
                """,
                (
                    verdict,
                    malicious,
                    suspicious,
                    harmless,
                    total_engines,
                    vt_link,
                    _now(),
                    analysis_id,
                ),
            )

    def fetch_scan_by_analysis_id(self, analysis_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM scans WHERE analysis_id = ?", (analysis_id,)
            ).fetchone()
            return dict(row) if row else None

    def fetch_scan_by_id(self, scan_id: int) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM scans WHERE id = ?", (scan_id,)
            ).fetchone()
            return dict(row) if row else None

    def fetch_all_scans(
        self, *, limit: int = 50, verdict_filter: str | None = None
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if verdict_filter:
                rows = conn.execute(
                    "SELECT * FROM scans WHERE verdict = ? ORDER BY id DESC LIMIT ?",
                    (verdict_filter, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
            return [dict(r) for r in rows]

    def fetch_scan_stats(self) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    COUNT(*) as total_scans,
                    SUM(CASE WHEN verdict = 'infected' THEN 1 ELSE 0 END) as infected,
                    SUM(CASE WHEN verdict = 'suspicious' THEN 1 ELSE 0 END) as suspicious,
                    SUM(CASE WHEN verdict = 'clean' THEN 1 ELSE 0 END) as clean,
                    SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued
                FROM scans
                """
            ).fetchone()
            return {
                "total_scans": int(row["total_scans"] or 0),
                "infected": int(row["infected"] or 0),
                "suspicious": int(row["suspicious"] or 0),
                "clean": int(row["clean"] or 0),
                "queued": int(row["queued"] or 0),
            }

    # --- Log analyzer reports ---

    def create_log_report(
        self, *, user_id: str, filename: str, report: dict[str, Any]
    ) -> str:
        import json

        report_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO log_reports (id, user_id, filename, created_at, report_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (report_id, user_id, filename, _now(), json.dumps(report, ensure_ascii=False)),
            )
        return report_id

    def get_log_report(
        self, report_id: str, *, user_id: str | None = None
    ) -> dict[str, Any] | None:
        import json

        with self._connect() as conn:
            if user_id:
                row = conn.execute(
                    "SELECT * FROM log_reports WHERE id = ? AND user_id = ?",
                    (report_id, user_id),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM log_reports WHERE id = ?", (report_id,)
                ).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "user_id": row["user_id"],
                "filename": row["filename"],
                "created_at": row["created_at"],
                "report": json.loads(row["report_json"]),
            }

    def list_log_reports(
        self, *, user_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, user_id, filename, created_at
                FROM log_reports
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    # ── Activity / audit log ────────────────────────────────────────

    def create_activity_log(
        self,
        *,
        action: str,
        category: str = "general",
        detail: str = "",
        username: str | None = None,
        user_id: str | None = None,
        ip_address: str = "",
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> str:
        log_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO activity_logs (
                    id, created_at, action, category, detail,
                    username, user_id, ip_address, resource_type, resource_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_id,
                    _now(),
                    action[:120],
                    category[:60],
                    (detail or "")[:2000],
                    (username or None),
                    user_id,
                    (ip_address or "")[:120],
                    resource_type,
                    resource_id,
                ),
            )
        return log_id

    def list_activity_logs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        category: str | None = None,
        action: str | None = None,
    ) -> list[dict[str, Any]]:
        limit = min(max(limit, 1), 500)
        offset = max(offset, 0)
        clauses: list[str] = []
        params: list[Any] = []
        if category:
            clauses.append("category = ?")
            params.append(category)
        if action:
            clauses.append("action = ?")
            params.append(action)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT id, created_at, action, category, detail,
                       username, user_id, ip_address, resource_type, resource_id
                FROM activity_logs
                {where}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (*params, limit, offset),
            ).fetchall()
            return [dict(r) for r in rows]

    def count_activity_logs(
        self, *, category: str | None = None, action: str | None = None
    ) -> int:
        clauses: list[str] = []
        params: list[Any] = []
        if category:
            clauses.append("category = ?")
            params.append(category)
        if action:
            clauses.append("action = ?")
            params.append(action)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS n FROM activity_logs {where}",
                params,
            ).fetchone()
            return int(row["n"] if row else 0)


@lru_cache
def get_app_database() -> AppDatabase:
    return AppDatabase()
