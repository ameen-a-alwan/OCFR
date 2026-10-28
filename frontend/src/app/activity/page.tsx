"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { cn, formatDate } from "@/lib/utils";

type ActivityItem = {
  id: string;
  created_at: string;
  action: string;
  category: string;
  detail: string;
  username: string | null;
  ip_address: string;
  actor_label: string;
  resource_type: string | null;
  resource_id: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  login_success: "دخول ناجح",
  login_failed: "دخول فاشل",
  virus_scan_file: "فحص ملف",
  virus_scan_url: "فحص رابط",
  ticket_submit: "تقديم بلاغ",
  ticket_status: "تحديث بلاغ",
  ticket_delete: "حذف بلاغ",
  ticket_convert: "تحويل بلاغ",
  tip_create: "نشر نصيحة",
  tip_delete: "حذف نصيحة",
  task_create: "إنشاء مهمة",
  task_status: "تحديث مهمة",
  task_transfer: "نقل مهمة",
  task_group_create: "إنشاء مجموعة مهام",
  log_analyze: "تحليل سجل",
  assistant_chat: "محادثة المساعد",
  user_create: "إنشاء مستخدم",
  user_update: "تحديث مستخدم",
  user_password_reset: "تغيير كلمة مرور",
  role_create: "إنشاء دور",
  role_delete: "حذف دور",
  role_permissions_update: "تحديث صلاحيات",
  role_permissions_reset: "إعادة صلاحيات",
};

const CATEGORY_LABELS: Record<string, string> = {
  auth: "دخول",
  virus: "فيروسات",
  tickets: "بلاغات",
  tips: "نصائح",
  tasks: "مهام",
  logs: "تحليل سجلات",
  assistant: "مساعد",
  users: "مستخدمون",
  roles: "أدوار",
  general: "عام",
};

export default function ActivityPage() {
  const { token, hasPermission } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canRead = hasPermission("activity.read");

  const load = useCallback(async () => {
    if (!token || !canRead) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.activity.list(token, {
        limit: 150,
        category: category || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setBusy(false);
    }
  }, [token, canRead, category]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <RequireAccess
      permissions={["activity.read"]}
      title="سجل العمليات يتطلب صلاحية"
    >
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <ScrollReveal>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <History className="mt-1 text-[var(--accent)]" size={28} />
              <div>
                <h1 className="display text-3xl sm:text-4xl">سجل العمليات</h1>
                <p className="mt-2 text-sm text-[var(--fg-muted)]">
                  عمليات الدخول، الفحوصات، البلاغات، والمهام. يُسجَّل اسم المستخدم
                  مع عنوان IP عند تسجيل الدخول، أو عنوان IP فقط للزوار.
                </p>
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => load()} disabled={busy}>
              تحديث
            </Button>
          </div>
        </ScrollReveal>

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            "",
            "auth",
            "virus",
            "tickets",
            "tasks",
            "tips",
            "logs",
            "assistant",
            "users",
            "roles",
          ].map((c) => (
            <button
              key={c || "all"}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                category === c
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--fg-muted)]",
              )}
            >
              {c ? CATEGORY_LABELS[c] || c : "الكل"}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
        <p className="mb-3 text-xs text-[var(--fg-subtle)]">
          {total} عملية
        </p>

        <div
          className="overflow-hidden rounded-2xl border border-[var(--border)]"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-muted)]">
                <tr>
                  <th className="px-3 py-3 text-right font-semibold">الوقت</th>
                  <th className="px-3 py-3 text-right font-semibold">العملية</th>
                  <th className="px-3 py-3 text-right font-semibold">الفاعل / IP</th>
                  <th className="px-3 py-3 text-right font-semibold">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-10 text-center text-[var(--fg-muted)]"
                    >
                      {busy ? "جاري التحميل…" : "لا توجد عمليات بعد"}
                    </td>
                  </tr>
                )}
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--border)] align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-[var(--fg-muted)]">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold">
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--fg-subtle)]">
                        {CATEGORY_LABELS[row.category] || row.category}
                      </span>
                    </td>
                    <td className="px-3 py-3" dir="ltr">
                      {row.actor_label}
                    </td>
                    <td className="px-3 py-3 text-[var(--fg-muted)]">
                      {row.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RequireAccess>
  );
}
