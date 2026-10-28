"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { ROLE_LABELS, cn } from "@/lib/utils";

export default function UsersPage() {
  const { token, isAdmin, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [roleOptions, setRoleOptions] = useState<
    Array<{ role: string; label: string }>
  >([{ role: "admin", label: "مدير النظام" }]);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [pwdDrafts, setPwdDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !isAdmin) return;
    // preload handled below
  }, [user, isAdmin]);

  const load = async () => {
    if (!token) return;
    const [u, rolesRes] = await Promise.all([
      api.users.list(token),
      api.roles.list(token).catch(() => null),
    ]);
    setUsers(u);
    if (rolesRes?.roles?.length) {
      setRoleOptions(
        rolesRes.roles.map((r) => ({
          role: r.role,
          label: r.label || ROLE_LABELS[r.role] || r.role,
        })),
      );
    }
  };

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "تعذر التحميل"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!isAdmin) {
    return (
      <RequireAccess adminOnly title="إدارة المستخدمين للمسؤولين فقط">
        <div />
      </RequireAccess>
    );
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await api.users.create(token, {
        username,
        display_name: displayName,
        password,
        role,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole(roleOptions[0]?.role || "admin");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id: string, nextRole: string) => {
    if (!token) return;
    await api.users.update(token, id, { role: nextRole });
    await load();
  };

  const toggleActive = async (u: User) => {
    if (!token) return;
    await api.users.update(token, u.id, { is_active: !u.is_active });
    await load();
  };

  const changePassword = async (id: string) => {
    if (!token) return;
    const pwd = pwdDrafts[id];
    if (!pwd || pwd.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    await api.users.setPassword(token, id, pwd);
    setPwdDrafts((d) => ({ ...d, [id]: "" }));
    setError("");
  };

  return (
    <RequireAccess adminOnly title="إدارة المستخدمين للمسؤولين فقط">
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <h1 className="display text-3xl sm:text-4xl">إدارة المستخدمين</h1>
        <p className="mt-2 text-[var(--fg-muted)]">
          إنشاء حسابات، تغيير الصلاحيات، كلمات المرور، وتفعيل/إيقاف الأعضاء.
        </p>
      </ScrollReveal>

      <form
        onSubmit={onCreate}
        className="mt-8 grid gap-3 rounded-2xl border border-[var(--border)] p-5 sm:grid-cols-2"
        style={{ background: "var(--bg-elevated)" }}
      >
        <input
          required
          placeholder="اسم المستخدم"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
        />
        <input
          required
          placeholder="الاسم الظاهر"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
        />
        <input
          required
          type="password"
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
        >
          {roleOptions.map((r) => (
            <option key={r.role} value={r.role}>
              {r.label}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy} className="sm:col-span-2">
          إنشاء مستخدم
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      <ul className="mt-10 space-y-4">
        {users.map((u) => (
          <li
            key={u.id}
            className={cn(
              "rounded-2xl border border-[var(--border)] p-5",
              u.is_active === false && "opacity-60",
            )}
            style={{ background: "var(--bg-elevated)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="display text-lg">{u.display_name}</p>
                <p className="text-sm text-[var(--fg-subtle)]">
                  @{u.username} · {ROLE_LABELS[u.role] || u.role}
                  {u.is_active === false ? " · موقّف" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  disabled={u.id === user?.id}
                >
                  {roleOptions.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label}
                    </option>
                  ))}
                  {!roleOptions.some((r) => r.role === u.role) && (
                    <option value={u.role}>
                      {ROLE_LABELS[u.role] || u.role}
                    </option>
                  )}
                </select>
                <Button
                  variant="secondary"
                  onClick={() => toggleActive(u)}
                  disabled={u.id === user?.id}
                >
                  {u.is_active === false ? "تفعيل" : "إيقاف"}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
              <input
                type="password"
                placeholder="كلمة مرور جديدة"
                value={pwdDrafts[u.id] || ""}
                onChange={(e) =>
                  setPwdDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                }
                className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
              <Button variant="secondary" onClick={() => changePassword(u.id)}>
                تحديث كلمة المرور
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-sm text-[var(--fg-subtle)]">
        <Link href="/" className="text-[var(--accent-bright)]">
          العودة للرئيسية
        </Link>
      </p>
    </div>
    </RequireAccess>
  );
}
