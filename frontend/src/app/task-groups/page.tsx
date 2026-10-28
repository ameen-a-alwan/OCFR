"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, UsersRound } from "lucide-react";
import { api, type TaskGroup, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { formatDate } from "@/lib/utils";

export default function TaskGroupsPage() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission("tasks.groups.manage");
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TaskGroup | null>(null);

  const load = useCallback(async () => {
    if (!token || !canManage) return;
    const [g, u] = await Promise.all([
      api.taskGroups.list(token),
      api.users.list(token),
    ]);
    setGroups(g);
    setUsers(u.filter((x) => x.is_active !== false));
    if (!leaderId && u[0]) setLeaderId(u[0].id);
  }, [token, canManage, leaderId]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "تعذر التحميل"),
    );
  }, [load]);

  if (!canManage) {
    return (
      <RequireAccess
        permissions={["tasks.groups.manage"]}
        title="ليس لديك صلاحية إدارة المجموعات"
      >
        <div />
      </RequireAccess>
    );
  }

  const toggleMember = (id: string) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !leaderId) return;
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await api.taskGroups.update(token, editing.id, {
          name: name.trim(),
          leader_id: leaderId,
          member_ids: memberIds,
        });
      } else {
        await api.taskGroups.create(token, {
          name: name.trim(),
          leader_id: leaderId,
          member_ids: memberIds,
        });
      }
      setName("");
      setMemberIds([]);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = async (g: TaskGroup) => {
    if (!token) return;
    const full = await api.taskGroups.get(token, g.id);
    setEditing(full);
    setName(full.name);
    setLeaderId(full.leader_id);
    setMemberIds((full.members || []).map((m) => m.id));
  };

  return (
    <RequireAccess permissions={["tasks.groups.manage"]}>
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <div className="flex items-center gap-3">
          <UsersRound className="text-[var(--accent)]" size={28} />
          <div>
            <h1 className="display text-3xl sm:text-4xl">مجموعات المهام</h1>
            <p className="mt-2 text-[var(--fg-muted)]">
              عيّن قائداً وأعضاء لكل مجموعة. من لديه صلاحية «عرض مهام المجموعة»
              يرى مهام أعضاء المجموعات التي يقودها.
            </p>
          </div>
        </div>
      </ScrollReveal>

      {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}

      <form
        onSubmit={onCreate}
        className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] p-6"
        style={{ background: "var(--bg-elevated)" }}
      >
        <h2 className="display text-xl">
          {editing ? "تعديل المجموعة" : "مجموعة جديدة"}
        </h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">اسم المجموعة</span>
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">القائد</span>
          <select
            required
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} (@{u.username})
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">الأعضاء</legend>
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {users.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={memberIds.includes(u.id) || u.id === leaderId}
                  disabled={u.id === leaderId}
                  onChange={() => toggleMember(u.id)}
                />
                {u.display_name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {editing ? "حفظ التعديلات" : "إنشاء المجموعة"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setName("");
                setMemberIds([]);
              }}
            >
              إلغاء
            </Button>
          )}
        </div>
      </form>

      <ul className="mt-10 space-y-3">
        {groups.map((g) => (
          <li
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] p-5"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div>
              <h3 className="display text-xl">{g.name}</h3>
              <p className="text-sm text-[var(--fg-muted)]">
                القائد: {g.leader_name} · الأعضاء: {g.member_count ?? "—"} ·{" "}
                {formatDate(g.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => startEdit(g)}>
                تعديل
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!token) return;
                  if (!confirm("حذف المجموعة؟")) return;
                  await api.taskGroups.remove(token, g.id);
                  await load();
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </li>
        ))}
        {groups.length === 0 && (
          <li className="text-[var(--fg-subtle)]">لا مجموعات بعد.</li>
        )}
      </ul>
    </div>
    </RequireAccess>
  );
}
