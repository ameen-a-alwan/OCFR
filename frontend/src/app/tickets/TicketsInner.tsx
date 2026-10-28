"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Paperclip,
  ShieldAlert,
  Trash2,
  ListTodo,
} from "lucide-react";
import { api, type Ticket, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { cn, formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  fixed: "تم الإصلاح",
  converted: "حوّل لمهمة",
};

export default function TicketsPageInner() {
  const { token, user, hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const wantManage = searchParams.get("manage") === "1";
  const canRead = hasPermission("tickets.read");
  const canManage = hasPermission("tickets.manage");
  const showManage = Boolean(user && canRead && wantManage);
  const manageDenied = Boolean(user && wantManage && !canRead);

  const [name, setName] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [issue, setIssue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [assignee, setAssignee] = useState("");

  const loadTickets = useCallback(async () => {
    if (!token || !canRead) return;
    const list = await api.tickets.list(token, filter || undefined);
    setTickets(list);
  }, [token, canRead, filter]);

  useEffect(() => {
    if (!showManage) return;
    loadTickets().catch((e) =>
      setError(e instanceof Error ? e.message : "تعذر التحميل"),
    );
  }, [showManage, loadTickets]);

  useEffect(() => {
    if (!token || !showManage || !canManage) return;
    api.users
      .list(token)
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [token, showManage, canManage]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.tickets.submit({
        submitter_name: name.trim(),
        workplace: workplace.trim(),
        body: issue.trim(),
        files,
      });
      setSubmitted(true);
      setName("");
      setWorkplace("");
      setIssue("");
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setBusy(false);
    }
  };

  const openTickets = useMemo(
    () => tickets.filter((t) => t.status === "open").length,
    [tickets],
  );

  if (manageDenied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="display text-2xl">صلاحية غير كافية</h1>
        <p className="mt-2 text-[var(--fg-muted)]">
          ليس لديك صلاحية لإدارة البلاغات.
        </p>
        <Button className="mt-6" onClick={() => router.push("/tickets")}>
          نموذج الإبلاغ
        </Button>
      </div>
    );
  }

  if (showManage) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ScrollReveal>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="display text-3xl sm:text-4xl">إدارة البلاغات</h1>
              <p className="mt-2 text-[var(--fg-muted)]">
                مراجعة البلاغات الأمنية الواردة من الجمهور.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => router.push("/tickets")}
              >
                نموذج الإبلاغ
              </Button>
            </div>
          </div>
        </ScrollReveal>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { id: "", label: "الكل" },
            { id: "open", label: "مفتوح" },
            { id: "fixed", label: "تم الإصلاح" },
            { id: "converted", label: "محوّل" },
          ].map((f) => (
            <button
              key={f.id || "all"}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                filter === f.id
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--fg-muted)]",
              )}
            >
              {f.label}
              {f.id === "open" ? ` (${openTickets})` : ""}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <ul className="space-y-3">
            {tickets.length === 0 && (
              <li className="text-[var(--fg-subtle)]">لا بلاغات.</li>
            )}
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(t);
                    setAssignee("");
                  }}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-right transition",
                    selected?.id === t.id
                      ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]",
                  )}
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.submitter_name}</p>
                      <p className="text-sm text-[var(--fg-subtle)]">
                        {t.workplace}
                      </p>
                    </div>
                    <span className="rounded-md bg-[var(--bg-soft)] px-2 py-1 text-xs">
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--fg-muted)]">
                    {t.body}
                  </p>
                  <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                    {formatDate(t.created_at)}
                    {t.files?.length ? ` · ${t.files.length} مرفق` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div
            className="rounded-2xl border border-[var(--border)] p-5"
            style={{ background: "var(--bg-elevated)" }}
          >
            {!selected ? (
              <p className="text-[var(--fg-subtle)]">اختر بلاغاً لعرض التفاصيل.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="display text-2xl">{selected.submitter_name}</h2>
                  <p className="text-sm text-[var(--fg-muted)]">
                    {selected.workplace} · {STATUS_LABELS[selected.status]}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-[var(--fg-muted)]">
                  {selected.body}
                </p>
                {selected.files?.length > 0 && (
                  <ul className="space-y-2">
                    {selected.files.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-sm text-[var(--accent-bright)]"
                          onClick={async () => {
                            if (!token) return;
                            const res = await fetch(
                              api.tickets.fileUrl(selected.id, f.id),
                              {
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                              },
                            );
                            if (!res.ok) {
                              setError("تعذر تنزيل المرفق");
                              return;
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = f.filename;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          <Paperclip size={14} />
                          {f.filename}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {canManage && selected.status !== "converted" && (
                  <div className="space-y-3 border-t border-[var(--border)] pt-4">
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== "fixed" && (
                        <Button
                          onClick={async () => {
                            if (!token) return;
                            setBusy(true);
                            try {
                              const updated = await api.tickets.setStatus(
                                token,
                                selected.id,
                                "fixed",
                              );
                              await loadTickets();
                              setSelected(updated);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "فشل التحديث",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                          disabled={busy}
                        >
                          <CheckCircle2 size={16} className="ml-1" />
                          تعيين كمُصلَح
                        </Button>
                      )}
                      {selected.status === "fixed" && (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            if (!token) return;
                            const updated = await api.tickets.setStatus(
                              token,
                              selected.id,
                              "open",
                            );
                            await loadTickets();
                            setSelected(updated);
                          }}
                        >
                          إعادة فتح
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (!token) return;
                          if (!confirm("حذف هذا البلاغ نهائياً؟")) return;
                          await api.tickets.remove(token, selected.id);
                          setSelected(null);
                          await loadTickets();
                        }}
                      >
                        <Trash2 size={16} className="ml-1" />
                        حذف
                      </Button>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] p-3">
                      <p className="mb-2 text-sm font-semibold">تحويل إلى مهمة</p>
                      <select
                        className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                      >
                        <option value="">تعيين لي</option>
                        {users
                          .filter((u) => u.is_active !== false)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.display_name}
                            </option>
                          ))}
                      </select>
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (!token) return;
                          setBusy(true);
                          try {
                            const result = await api.tickets.convert(
                              token,
                              selected.id,
                              {
                                assigned_to: assignee || undefined,
                              },
                            );
                            await loadTickets();
                            setSelected(result.ticket);
                            router.push(`/tasks/${result.task.id}`);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "فشل التحويل",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <ListTodo size={16} className="ml-1" />
                        إنشاء مهمة
                      </Button>
                    </div>
                  </div>
                )}

                {selected.status === "converted" &&
                  selected.converted_task_id && (
                    <Link
                      href={`/tasks/${selected.converted_task_id}`}
                      className="inline-flex text-[var(--accent-bright)]"
                    >
                      فتح المهمة المرتبطة
                    </Link>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <div className="mb-8 flex items-center gap-3">
          <ShieldAlert className="text-[var(--accent)]" size={28} />
          <div>
            <h1 className="display text-3xl">بلاغ أمني</h1>
            <p className="mt-1 text-[var(--fg-muted)]">
              أبلغ عن مشكلة أو طلب أمني. سيتم مراجعة البلاغ من الفريق المختص.
            </p>
          </div>
        </div>
      </ScrollReveal>

      {user && canRead && (
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={() => router.push("/tickets?manage=1")}
          >
            إدارة البلاغات
          </Button>
        </div>
      )}

      {submitted ? (
        <div
          className="rounded-2xl border border-[var(--border)] p-8 text-center"
          style={{ background: "var(--bg-elevated)" }}
        >
          <CheckCircle2
            className="mx-auto mb-4 text-[var(--success)]"
            size={40}
          />
          <h2 className="display text-2xl">تم استلام البلاغ</h2>
          <p className="mt-2 text-[var(--fg-muted)]">
            شكراً لتعاونكم. سيتابع الفريق المختص البلاغ.
          </p>
          <Button className="mt-6" onClick={() => setSubmitted(false)}>
            إرسال بلاغ آخر
          </Button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-[var(--border)] p-6"
          style={{ background: "var(--bg-elevated)" }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">الاسم</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">جهة العمل / القسم</span>
            <input
              required
              minLength={2}
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">وصف المشكلة أو الطلب</span>
            <textarea
              required
              minLength={5}
              rows={6}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">مرفقات (اختياري)</span>
            <input
              type="file"
              multiple
              onChange={(e) =>
                setFiles(Array.from(e.target.files || []).slice(0, 10))
              }
              className="w-full text-sm text-[var(--fg-muted)]"
            />
            {files.length > 0 && (
              <p className="text-xs text-[var(--fg-subtle)]">
                {files.length} ملف محدد
              </p>
            )}
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "جاري الإرسال…" : "إرسال البلاغ"}
          </Button>
        </form>
      )}
    </div>
  );
}
