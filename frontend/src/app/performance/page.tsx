"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type PerformancePeriod,
  type PerformanceRow,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  ScrollReveal,
  Stagger,
  StaggerItem,
} from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { ROLE_LABELS, cn } from "@/lib/utils";

const PERIODS: { id: PerformancePeriod; label: string }[] = [
  { id: "week", label: "آخر أسبوع" },
  { id: "month", label: "آخر شهر" },
  { id: "year", label: "آخر سنة" },
  { id: "total", label: "الإجمالي" },
];

export default function PerformancePage() {
  const { token, user } = useAuth();
  const [period, setPeriod] = useState<PerformancePeriod>("total");
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [ticketOverview, setTicketOverview] = useState({
    open: 0,
    fixed: 0,
    converted: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.performance.summary(token, period),
      api.performance.ticketsOverview(token).catch(() => ({
        open: 0,
        fixed: 0,
        converted: 0,
      })),
    ])
      .then(([summary, overview]) => {
        setRows(summary);
        setTicketOverview(overview);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "خطأ"))
      .finally(() => setLoading(false));
  }, [token, period]);

  if (!user) {
    return (
      <RequireAccess
        permissions={["performance.read"]}
        title="متابعة الأداء تتطلب صلاحية"
      >
        <div />
      </RequireAccess>
    );
  }

  return (
    <RequireAccess
      permissions={["performance.read"]}
      title="متابعة الأداء تتطلب صلاحية"
    >
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <h1 className="display text-3xl sm:text-4xl">أداء الفريق</h1>
        <p className="mt-2 max-w-2xl text-[var(--fg-muted)]">
          مؤشرات الإنجاز حسب الفترة الزمنية المختارة، مع ملخص البلاغات الأمنية.
        </p>
      </ScrollReveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "بلاغات مفتوحة", value: ticketOverview.open },
          { label: "تم إصلاحها", value: ticketOverview.fixed },
          { label: "حوّلت لمهام", value: ticketOverview.converted },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--border)] p-5"
            style={{ background: "var(--bg-elevated)" }}
          >
            <p className="text-sm text-[var(--fg-subtle)]">{card.label}</p>
            <p className="display mt-1 text-3xl">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              period === p.id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="loader-ring" />
        </div>
      )}

      {!loading && (
        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <StaggerItem key={row.user_id}>
              <div
                className="rounded-2xl border border-[var(--border)] p-6"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="display text-xl">{row.display_name}</h2>
                    <p className="text-sm text-[var(--fg-subtle)]">
                      @{row.username} · {ROLE_LABELS[row.role] || row.role}
                    </p>
                  </div>
                  <span
                    className="display text-2xl"
                    style={{ color: "var(--accent-bright)" }}
                  >
                    {row.completion_rate}%
                  </span>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(row.completion_rate, 100)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--fg-subtle)]">مكتملة</dt>
                    <dd className="display text-lg text-[var(--success)]">
                      {row.completed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-subtle)]">قيد التنفيذ</dt>
                    <dd className="display text-lg">{row.in_progress}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-subtle)]">معلّقة</dt>
                    <dd className="display text-lg">{row.pending}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-subtle)]">إجراءات</dt>
                    <dd className="display text-lg">{row.actions}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-subtle)]">بلاغات عولجت</dt>
                    <dd className="display text-lg">
                      {row.tickets_handled ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--fg-subtle)]">بلاغات أُصلحت</dt>
                    <dd className="display text-lg">
                      {row.tickets_fixed ?? 0}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[var(--fg-subtle)]">حوّلت لمهام</dt>
                    <dd className="display text-lg">
                      {row.tickets_converted ?? 0}
                    </dd>
                  </div>
                </dl>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
    </RequireAccess>
  );
}
