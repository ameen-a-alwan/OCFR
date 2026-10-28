"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { ROLE_LABELS, cn } from "@/lib/utils";

type RoleRow = {
  role: string;
  label?: string;
  permissions: string[];
  is_system?: boolean;
  is_custom: boolean;
  defaults: string[];
};

function roleLabel(r: RoleRow) {
  return r.label || ROLE_LABELS[r.role] || r.role;
}

export default function PermissionsPage() {
  const { token, isAdmin, user, hasPermission } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<Array<{ code: string; label: string }>>(
    [],
  );
  const [selected, setSelected] = useState("admin");
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const canManage = hasPermission("roles.manage");
  const selectedMeta = roles.find((r) => r.role === selected);
  const isSystemSelected = !!selectedMeta?.is_system || selected === "admin";

  useEffect(() => {
    // gated by RequireAccess
  }, []);

  const load = async () => {
    if (!token) return;
    const res = await api.roles.list(token);
    setRoles(res.roles);
    setCatalog(res.catalog);
    const current =
      res.roles.find((r) => r.role === selected) || res.roles[0];
    if (current) {
      setSelected(current.role);
      setDraft([...current.permissions]);
    }
  };

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "تعذر التحميل"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const row = roles.find((r) => r.role === selected);
    if (row) setDraft([...row.permissions]);
  }, [selected, roles]);

  if (!canManage) {
    return (
      <RequireAccess permissions={["roles.manage"]} title="إدارة الصلاحيات تتطلب صلاحية">
        <div />
      </RequireAccess>
    );
  }

  const toggle = (code: string) => {
    if (selected === "admin") return;
    setDraft((d) =>
      d.includes(code) ? d.filter((c) => c !== code) : [...d, code],
    );
  };

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api.roles.update(token, selected, draft);
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.roles.reset(token, selected);
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإعادة");
    } finally {
      setBusy(false);
    }
  };

  const onCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api.roles.create(token, {
        code: newCode.trim(),
        label: newLabel.trim(),
        permissions: draft.length ? draft : undefined,
      });
      setMsg(res.message);
      setNewCode("");
      setNewLabel("");
      setSelected(res.role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء الدور");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteRole = async () => {
    if (!token || !selectedMeta || selectedMeta.is_system) return;
    if (!confirm(`حذف الدور «${roleLabel(selectedMeta)}»؟`)) return;
    setBusy(true);
    setError("");
    try {
      await api.roles.remove(token, selected);
      setMsg("تم حذف الدور");
      setSelected("admin");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAccess permissions={["roles.manage"]} title="إدارة الصلاحيات تتطلب صلاحية">
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <h1 className="display text-3xl sm:text-4xl">الأدوار والصلاحيات</h1>
        <p className="mt-2 text-[var(--fg-muted)]">
          أنشئ أدواراً جديدة وحدد صلاحيات كل دور. المدير يحتفظ بكل الصلاحيات دائماً.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/users"
            className="text-[var(--accent-bright)] hover:underline"
          >
            إدارة المستخدمين وتعيين الأدوار ←
          </Link>
        </p>
      </ScrollReveal>

      <form
        onSubmit={onCreateRole}
        className="mt-8 grid gap-3 rounded-2xl border border-[var(--border)] p-5 sm:grid-cols-[1fr_1fr_auto]"
        style={{ background: "var(--bg-elevated)" }}
      >
        <input
          required
          dir="ltr"
          placeholder="role_code (english)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-mono text-sm"
        />
        <input
          required
          placeholder="اسم الدور بالعربية"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
        />
        <Button type="submit" disabled={busy}>
          إضافة دور
        </Button>
        <p className="text-xs text-[var(--fg-subtle)] sm:col-span-3">
          الرمز بالإنجليزية فقط (مثل analyst). بعد الإنشاء يمكنك تعديل الصلاحيات
          أدناه.
        </p>
      </form>

      <div className="mt-8 flex flex-wrap gap-2">
        {roles.map((r) => (
          <button
            key={r.role}
            type="button"
            onClick={() => setSelected(r.role)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              selected === r.role
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--fg-muted)]",
            )}
          >
            {roleLabel(r)}
            {!r.is_system ? " · مخصّص" : ""}
          </button>
        ))}
      </div>

      <div
        className="mt-8 rounded-2xl border border-[var(--border)] p-6"
        style={{ background: "var(--bg-elevated)" }}
      >
        {selected === "admin" && (
          <p className="mb-4 text-sm text-[var(--fg-muted)]">
            صلاحيات المدير ثابتة ولا يمكن تقليلها.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.map((p) => {
            const checked = draft.includes(p.code);
            return (
              <label
                key={p.code}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 transition",
                  checked && "border-[var(--accent)]/50 bg-[var(--accent-dim)]",
                  selected === "admin" && "cursor-default opacity-80",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={selected === "admin"}
                  onChange={() => toggle(p.code)}
                />
                <span>
                  <span className="block font-semibold">{p.label}</span>
                  <span
                    className="font-mono text-[11px] text-[var(--fg-subtle)]"
                    dir="ltr"
                  >
                    {p.code}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={busy || selected === "admin"}
            onClick={save}
          >
            حفظ الصلاحيات
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || selected === "admin"}
            onClick={reset}
          >
            إعادة للافتراضي
          </Button>
          {!isSystemSelected && selected !== "admin" && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={onDeleteRole}
            >
              حذف الدور
            </Button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        {msg && <p className="mt-4 text-sm text-[var(--success)]">{msg}</p>}
        {!isAdmin && (
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            تحتاج صلاحية roles.manage
          </p>
        )}
      </div>
    </div>
    </RequireAccess>
  );
}
