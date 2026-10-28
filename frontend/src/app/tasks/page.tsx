"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Task, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  ScrollReveal,
  Stagger,
  StaggerItem,
} from "@/components/animations/ScrollReveal";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  cn,
  formatDate,
} from "@/lib/utils";
import { RequireAccess } from "@/components/auth/RequireAccess";

export default function TasksPage() {
  const { token, user, hasPermission } = useAuth();
  const canAssign = hasPermission("tasks.assign");
  const canWrite = hasPermission("tasks.write");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      const [t, u] = await Promise.all([
        api.tasks.list(token, {
          status: filter || undefined,
          mine,
        }),
        api.users.list(token),
      ]);
      setTasks(t);
      setUsers(u);
      if (!assignedTo) {
        if (canAssign && u[0]) setAssignedTo(u[0].id);
        else if (user?.id) setAssignedTo(user.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحميل");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filter, mine]);

  if (!user) {
    return (
      <RequireAccess
        anyPermission={["tasks.view_all", "tasks.view_own", "tasks.view_group"]}
        title="المهام تتطلب صلاحية"
      >
        <div />
      </RequireAccess>
    );
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canWrite) return;
    setBusy(true);
    try {
      await api.tasks.create(token, {
        title,
        description,
        priority,
        assigned_to: assignedTo || null,
      });
      setTitle("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    if (!token) return;
    await api.tasks.setStatus(token, id, status);
    await load();
  };

  const transfer = async (id: string, to: string) => {
    if (!token || !to) return;
    await api.tasks.transfer(token, id, to);
    await load();
  };

  return (
    <RequireAccess
      anyPermission={["tasks.view_all", "tasks.view_own", "tasks.view_group"]}
      title="المهام تتطلب صلاحية"
    >
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <h1 className="display text-3xl sm:text-4xl">إدارة المهام</h1>
        <p className="mt-2 text-[var(--fg-muted)]">
          أنشئ المهام، انقلها بين الأعضاء، وعلّمها كمكتملة لتتبع الأداء.
        </p>
      </ScrollReveal>

      {canWrite && (
      <ScrollReveal delay={0.08}>
        <form
          onSubmit={onCreate}
          className="mt-8 grid gap-3 rounded-2xl border border-[var(--border)] p-5 sm:grid-cols-2 lg:grid-cols-6"
          style={{ background: "var(--bg-elevated)" }}
        >
          <input
            required
            placeholder="عنوان المهمة"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 lg:col-span-2"
          />
          <input
            placeholder="وصف مختصر"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 lg:col-span-2"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          >
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            disabled={!canAssign}
          >
            {(canAssign ? users : users.filter((u) => u.id === user?.id)).map(
              (u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ),
            )}
          </select>
          <Button type="submit" disabled={busy} className="sm:col-span-2 lg:col-span-6">
            إنشاء مهمة
          </Button>
        </form>
      </ScrollReveal>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMine(false)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm",
            !mine ? "bg-[var(--accent-dim)] text-[var(--accent-bright)]" : "text-[var(--fg-muted)]",
          )}
        >
          الكل
        </button>
        <button
          type="button"
          onClick={() => setMine(true)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm",
            mine ? "bg-[var(--accent-dim)] text-[var(--accent-bright)]" : "text-[var(--fg-muted)]",
          )}
        >
          مهامي
        </button>
        {["", "todo", "in_progress", "done"].map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              filter === s
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--fg-muted)]",
            )}
          >
            {s ? STATUS_LABELS[s] : "كل الحالات"}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      <Stagger className="mt-8 space-y-4">
        {tasks.map((task) => (
          <StaggerItem key={task.id}>
            <article
              className="rounded-2xl border border-[var(--border)] p-5 transition hover:border-[var(--border-strong)]"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/tasks/${task.id}`}>
                    <h2 className="display text-xl hover:text-[var(--accent-bright)]">
                      {task.title}
                    </h2>
                  </Link>
                  {task.description && (
                    <p className="mt-1 text-sm text-[var(--fg-muted)]">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--fg-subtle)]">
                    <span className="rounded-md bg-[var(--accent-dim)] px-2 py-1 text-[var(--accent-bright)]">
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span className="rounded-md border border-[var(--border)] px-2 py-1">
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span>المسؤول: {task.assigned_to_name || "—"}</span>
                    <span>أُنشئت: {formatDate(task.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/tasks/${task.id}`}>
                    <Button variant="secondary">فتح</Button>
                  </Link>
                  {canWrite && task.status !== "in_progress" && task.status !== "done" && (
                    <Button
                      variant="secondary"
                      onClick={() => setStatus(task.id, "in_progress")}
                    >
                      بدء
                    </Button>
                  )}
                  {canWrite && task.status !== "done" && (
                    <Button onClick={() => setStatus(task.id, "done")}>
                      إكمال
                    </Button>
                  )}
                </div>
              </div>
              {canAssign && task.status !== "done" && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                  <span className="text-sm text-[var(--fg-muted)]">نقل إلى:</span>
                  <select
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) transfer(task.id, e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      اختر عضواً
                    </option>
                    {users
                      .filter((u) => u.id !== task.assigned_to)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </article>
          </StaggerItem>
        ))}
      </Stagger>

      {tasks.length === 0 && (
        <p className="mt-10 text-center text-[var(--fg-muted)]">
          لا توجد مهام مطابقة للمرشّح الحالي.
        </p>
      )}
    </div>
    </RequireAccess>
  );
}
