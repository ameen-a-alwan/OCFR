"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type LogReport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  ScrollReveal,
  Stagger,
  StaggerItem,
} from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { cn } from "@/lib/utils";

const SEVERITY_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--accent-bright)",
  info: "var(--fg-muted)",
};

const SEVERITY_AR: Record<string, string> = {
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
  info: "معلومات",
};

const CHART_COLORS = [
  "#1e6fff",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a3a3a3",
];

export default function LogResultsPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const [report, setReport] = useState<LogReport | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    api.logs
      .get(token, id)
      .then((res) => {
        setReport(res.report);
        setFilename(res.filename);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "خطأ"))
      .finally(() => setLoading(false));
  }, [token, id]);

  const levelPie = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.summary.level_counts || {}).map(
      ([name, value]) => ({ name, value }),
    );
  }, [report]);

  const timelineData = useMemo(() => {
    if (!report) return [];
    return report.timeline.slice(-24).map((t) => ({
      bucket: t.bucket.slice(5),
      count: t.count,
      ...t.by_level,
    }));
  }, [report]);

  if (!user) {
    return (
      <RequireAccess permissions={["logs.read"]} title="عرض التقرير يتطلب صلاحية">
        <div />
      </RequireAccess>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="loader-ring" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <RequireAccess permissions={["logs.read"]}>
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-[var(--danger)]">{error || "التقرير غير موجود"}</p>
        <Link href="/logs" className="mt-6 inline-block">
          <Button variant="secondary">عودة</Button>
        </Link>
      </div>
      </RequireAccess>
    );
  }

  const s = report.summary;

  return (
    <RequireAccess permissions={["logs.read"]} title="عرض التقرير يتطلب صلاحية">
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <p className="mb-2 text-sm text-[var(--fg-subtle)]">
          <Link href="/logs" className="hover:text-[var(--accent-bright)]">
            تحليل السجلات
          </Link>
          {" / "}
          التقرير
        </p>
        <h1 className="display text-3xl sm:text-4xl">تقرير التحليل</h1>
        <p className="mt-2 text-[var(--fg-muted)]">{filename}</p>
      </ScrollReveal>

      <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["الأحداث", s.total_events],
            ["أخطاء", s.errors],
            ["تحذيرات", s.warnings],
            ["نتائج حرجة", s.critical_findings],
            ["عناوين IP", s.unique_ips],
          ] as const
        ).map(([label, value]) => (
          <StaggerItem key={label}>
            <div
              className="rounded-2xl border border-[var(--border)] p-5 text-center"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="display text-3xl">{value}</div>
              <div className="mt-1 text-sm text-[var(--fg-muted)]">{label}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <section className="mt-12">
        <h2 className="display text-xl">النتائج</h2>
        <ul className="mt-4 space-y-3">
          {report.findings.map((f, i) => (
            <li
              key={`${f.title}-${i}`}
              className="rounded-2xl border border-[var(--border)] p-5"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
                  style={{
                    background: SEVERITY_COLOR[f.severity] || "var(--fg-muted)",
                  }}
                >
                  {SEVERITY_AR[f.severity] || f.severity}
                </span>
                <h3 className="font-semibold">{f.title}</h3>
                {f.count > 0 && (
                  <span className="text-sm text-[var(--fg-subtle)]">
                    × {f.count}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                {f.description}
              </p>
              {f.mitre && (
                <p className="mt-1 text-xs text-[var(--accent-bright)]" dir="ltr">
                  {f.mitre}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div
          className="rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <h2 className="display mb-4 text-lg">توزيع المستويات</h2>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={levelPie}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label
                >
                  {levelPie.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <h2 className="display mb-4 text-lg">أهم معرفات الأحداث</h2>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.top_event_ids.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1e6fff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {timelineData.length > 0 && (
        <section
          className="mt-8 rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <h2 className="display mb-4 text-lg">الخط الزمني</h2>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="bucket" hide={timelineData.length > 12} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1e6fff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {report.geo.length > 0 && (
        <section
          className="mt-8 rounded-2xl border border-[var(--border)] p-5"
          style={{ background: "var(--bg-elevated)" }}
        >
          <h2 className="display mb-4 text-lg">التوزيع الجغرافي لعناوين IP</h2>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.geo.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="country" width={110} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="display text-xl">أنشطة المهاجم / أحداث بارزة</h2>
        <div
          className="mt-4 overflow-auto rounded-2xl border border-[var(--border)]"
          style={{ background: "var(--bg-elevated)" }}
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[var(--bg-soft)] text-[var(--fg-muted)]">
              <tr>
                <th className="px-4 py-3 text-start">الوقت</th>
                <th className="px-4 py-3 text-start">الإجراء</th>
                <th className="px-4 py-3 text-start">الفاعل</th>
                <th className="px-4 py-3 text-start">الهدف</th>
                <th className="px-4 py-3 text-start">الخطورة</th>
              </tr>
            </thead>
            <tbody>
              {report.attacker_actions.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--fg-muted)]"
                  >
                    لا توجد أنشطة بارزة
                  </td>
                </tr>
              )}
              {report.attacker_actions.slice(0, 80).map((a, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 whitespace-nowrap" dir="ltr">
                    {a.time || "—"}
                  </td>
                  <td className="px-4 py-2.5">{a.action}</td>
                  <td className="px-4 py-2.5" dir="ltr">
                    {a.actor}
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px] truncate" dir="auto">
                    {a.target}
                  </td>
                  <td
                    className={cn("px-4 py-2.5 font-semibold")}
                    style={{ color: SEVERITY_COLOR[a.severity] }}
                  >
                    {SEVERITY_AR[a.severity] || a.severity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="display text-xl">عناوين IP المثراة</h2>
        <div
          className="mt-4 overflow-auto rounded-2xl border border-[var(--border)]"
          style={{ background: "var(--bg-elevated)" }}
        >
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--bg-soft)] text-[var(--fg-muted)]">
              <tr>
                <th className="px-4 py-3 text-start">IP</th>
                <th className="px-4 py-3 text-start">الدولة</th>
                <th className="px-4 py-3 text-start">ISP</th>
                <th className="px-4 py-3 text-start">أحداث</th>
                <th className="px-4 py-3 text-start">سمعة التهديد</th>
              </tr>
            </thead>
            <tbody>
              {report.ips.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--fg-muted)]"
                  >
                    لم تُستخرج عناوين IP
                  </td>
                </tr>
              )}
              {report.ips.map((row) => (
                <tr key={row.ip} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 font-mono" dir="ltr">
                    {row.ip}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.geo?.city
                      ? `${row.geo.city}, ${row.geo.country}`
                      : row.geo?.country || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-muted)]" dir="ltr">
                    {row.geo?.isp || "—"}
                  </td>
                  <td className="px-4 py-2.5">{row.related_events}</td>
                  <td className="px-4 py-2.5">
                    {row.vt_malicious == null ? "—" : row.vt_malicious}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10">
        <Link href="/logs">
          <Button variant="secondary">تحليل سجل آخر</Button>
        </Link>
      </div>
    </div>
    </RequireAccess>
  );
}
