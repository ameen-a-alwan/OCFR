"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Activity,
  FileUp,
  MessageSquare,
  Paperclip,
  Reply,
} from "lucide-react";
import {
  api,
  type Task,
  type TaskComment,
  type TaskEvent,
  type TaskFile,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  cn,
  formatDate,
} from "@/lib/utils";
import { RequireAccess } from "@/components/auth/RequireAccess";

type SideTab = "comments" | "activity";

const EVENT_LABELS: Record<string, string> = {
  created: "إنشاء",
  assigned: "إسناد",
  transferred: "نقل",
  status_change: "تغيير حالة",
  comment: "تعليق",
  file_upload: "رفع ملف",
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = String(params.id || "");
  const { token, user, hasPermission } = useAuth();
  const canAssign = hasPermission("tasks.assign");
  const canWrite = hasPermission("tasks.write");
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>("comments");

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    const [t, c, f, u, ev] = await Promise.all([
      api.tasks.get(token, taskId),
      api.tasks.comments(token, taskId),
      api.tasks.files(token, taskId),
      api.users.list(token),
      api.tasks.events(token, taskId),
    ]);
    setTask(t);
    setComments(c);
    setFiles(f);
    setUsers(u);
    setEvents(ev);
  }, [token, taskId]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "تعذر التحميل"),
    );
  }, [load]);

  const roots = useMemo(
    () => comments.filter((c) => !c.parent_id),
    [comments],
  );
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parent_id === id);

  if (!user) {
    return (
      <RequireAccess
        anyPermission={["tasks.view_all", "tasks.view_own", "tasks.view_group"]}
        title="يجب تسجيل الدخول"
      >
        <div />
      </RequireAccess>
    );
  }

  if (!task && !error) {
    return (
      <div className="flex justify-center py-24">
        <div className="loader-ring" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center text-[var(--danger)]">
        {error || "المهمة غير موجودة"}
      </div>
    );
  }

  const onComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setBusy(true);
    try {
      await api.tasks.addComment(token, taskId, {
        body: body.trim(),
        parent_id: replyTo,
      });
      setBody("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التعليق");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!token || !file) return;
    setBusy(true);
    setError("");
    try {
      await api.tasks.uploadFile(token, taskId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الرفع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAccess
      anyPermission={["tasks.view_all", "tasks.view_own", "tasks.view_group"]}
      title="المهام تتطلب صلاحية"
    >
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/tasks"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--fg-muted)] hover:text-[var(--accent-bright)]"
      >
        <ArrowRight size={16} />
        العودة للمهام
      </Link>

      <ScrollReveal>
        <div
          className="rounded-2xl border border-[var(--border)] p-6 sm:p-8"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="display text-3xl">{task.title}</h1>
              {task.description && (
                <p className="mt-3 whitespace-pre-wrap text-[var(--fg-muted)]">
                  {task.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-[var(--accent-dim)] px-2 py-1 text-[var(--accent-bright)]">
                  {STATUS_LABELS[task.status]}
                </span>
                <span className="rounded-md border border-[var(--border)] px-2 py-1">
                  {PRIORITY_LABELS[task.priority]}
                </span>
                <span className="text-[var(--fg-subtle)]">
                  المسؤول: {task.assigned_to_name || "—"}
                </span>
                <span className="text-[var(--fg-subtle)]">
                  أنشأها: {task.created_by_name}
                </span>
              </div>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {task.status !== "done" && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        token &&
                        api.tasks
                          .setStatus(token, taskId, "in_progress")
                          .then(load)
                      }
                    >
                      بدء
                    </Button>
                    <Button
                      onClick={() =>
                        token &&
                        api.tasks.setStatus(token, taskId, "done").then(load)
                      }
                    >
                      إكمال
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {canAssign && task.status !== "done" && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
              <span className="text-sm text-[var(--fg-muted)]">نقل إلى:</span>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (token && e.target.value) {
                    api.tasks
                      .transfer(token, taskId, e.target.value)
                      .then(load)
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : "فشل النقل",
                        ),
                      );
                  }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  اختر عضواً
                </option>
                {users
                  .filter(
                    (u) => u.id !== task.assigned_to && u.is_active !== false,
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </ScrollReveal>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section
          className="rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setSideTab("comments")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                sideTab === "comments"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--fg-muted)]",
              )}
            >
              <MessageSquare size={16} />
              التعليقات
            </button>
            <button
              type="button"
              onClick={() => setSideTab("activity")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                sideTab === "activity"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--fg-muted)]",
              )}
            >
              <Activity size={16} />
              النشاط
            </button>
          </div>

          {sideTab === "comments" ? (
            <>
              <div className="space-y-4">
                {roots.length === 0 && (
                  <p className="text-sm text-[var(--fg-subtle)]">
                    لا تعليقات بعد.
                  </p>
                )}
                {roots.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-xl border p-4",
                      c.is_system
                        ? "border-[var(--accent)]/40 bg-[var(--accent-dim)]"
                        : "border-[var(--border)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--fg-subtle)]">
                      <span className="font-semibold text-[var(--fg)]">
                        {c.is_system ? "النظام" : c.author_name}
                      </span>
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--fg-muted)]">
                      {c.body}
                    </p>
                    {!c.is_system && canWrite && (
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent-bright)]"
                        onClick={() => setReplyTo(c.id)}
                      >
                        <Reply size={12} />
                        رد
                      </button>
                    )}
                    <div className="mt-3 space-y-2 border-r border-[var(--border)] pr-3">
                      {repliesOf(c.id).map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg bg-[var(--bg-soft)] px-3 py-2"
                        >
                          <div className="flex justify-between text-xs text-[var(--fg-subtle)]">
                            <span className="font-semibold text-[var(--fg)]">
                              {r.author_name}
                            </span>
                            <span>{formatDate(r.created_at)}</span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--fg-muted)]">
                            {r.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {canWrite && (
                <form onSubmit={onComment} className="mt-5 space-y-3">
                  {replyTo && (
                    <p className="text-xs text-[var(--accent-bright)]">
                      رد على تعليق ·{" "}
                      <button type="button" onClick={() => setReplyTo(null)}>
                        إلغاء
                      </button>
                    </p>
                  )}
                  <textarea
                    required
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="اكتب تعليقاً…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                  />
                  <Button type="submit" disabled={busy}>
                    إرسال
                  </Button>
                </form>
              )}
            </>
          ) : (
            <ul className="space-y-3">
              {events.length === 0 && (
                <li className="text-sm text-[var(--fg-subtle)]">
                  لا أحداث بعد.
                </li>
              )}
              {[...events].reverse().map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[var(--border)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg-subtle)]">
                    <span className="rounded-md bg-[var(--bg-soft)] px-2 py-0.5 font-semibold text-[var(--fg)]">
                      {EVENT_LABELS[ev.event_type] || ev.event_type}
                    </span>
                    <span>{formatDate(ev.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--fg-muted)]">
                    <span className="font-semibold text-[var(--fg)]">
                      {ev.actor_name}
                    </span>
                    {" — "}
                    {ev.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <h2 className="display mb-4 flex items-center gap-2 text-xl">
            <Paperclip size={18} className="text-[var(--accent)]" />
            الملفات
          </h2>
          <p className="mb-4 text-xs text-[var(--fg-subtle)]">
            تُفهرس تلقائياً في محرك البحث (OCFR).
          </p>

          {canWrite && (
            <label className="mb-5 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 transition hover:bg-[var(--accent-dim)]">
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                disabled={busy}
                onChange={(e) => onUpload(e.target.files?.[0] || null)}
              />
              <FileUp className="mb-2 text-[var(--accent)]" size={22} />
              <span className="text-sm font-semibold">
                {busy ? "جاري الرفع والفهرسة…" : "رفع ملف للمهمة"}
              </span>
            </label>
          )}

          <ul className="space-y-2">
            {files.length === 0 && (
              <li className="text-sm text-[var(--fg-subtle)]">لا ملفات بعد.</li>
            )}
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{f.filename}</p>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {f.uploader_name} · {formatDate(f.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[var(--accent-bright)]"
                  onClick={() =>
                    token &&
                    api.documents
                      .openEntry(token, f.open_url, f.filename)
                      .catch(() => setError("تعذر فتح الملف"))
                  }
                >
                  فتح
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
    </RequireAccess>
  );
}
