"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Search,
  Filter,
} from "lucide-react";
import { api, type VirusAnalysis, type VirusEngineResult } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  ScrollReveal,
  Stagger,
  StaggerItem,
} from "@/components/animations/ScrollReveal";
import { cn } from "@/lib/utils";

const VERDICT_META: Record<
  string,
  {
    label: string;
    subtitle: string;
    color: string;
    glow: string;
    Icon: typeof ShieldCheck;
  }
> = {
  clean: {
    label: "آمن",
    subtitle: "لم ترصد المحركات تهديداً واضحاً",
    color: "var(--success)",
    glow: "rgba(34, 197, 94, 0.22)",
    Icon: ShieldCheck,
  },
  suspicious: {
    label: "مشبوه",
    subtitle: "بعض المحركات أشارت إلى سلوك غير موثوق",
    color: "var(--warning)",
    glow: "rgba(245, 158, 11, 0.22)",
    Icon: ShieldQuestion,
  },
  infected: {
    label: "مصاب",
    subtitle: "رُصدت مؤشرات برمجيات خبيثة من عدة محركات",
    color: "var(--danger)",
    glow: "rgba(255, 77, 109, 0.25)",
    Icon: ShieldAlert,
  },
};

type EngineFilter = "all" | "infected" | "clean" | "other";

function SafetyRing({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display text-3xl leading-none" style={{ color }}>
          {percent}%
        </span>
        <span className="mt-1 text-[11px] text-[var(--fg-subtle)]">أمان</span>
      </div>
    </div>
  );
}

export default function VirusResultsPage() {
  const params = useParams();
  const analysisId = decodeURIComponent(String(params.id || ""));
  const { token, loading: authLoading } = useAuth();
  const [data, setData] = useState<VirusAnalysis | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(true);
  const [filter, setFilter] = useState<EngineFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const res = await api.virus.getAnalysis(analysisId, token);
        if (cancelled) return;
        setData(res);
        const status = res.data?.attributes?.status;
        if (status === "completed") {
          setPolling(false);
        } else {
          setPolling(true);
          timer = setTimeout(poll, 4000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "فشل جلب النتيجة");
        setPolling(false);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysisId, token]);

  const verdict = data?.verdict_summary?.verdict || "";
  const meta = VERDICT_META[verdict];
  const engines: VirusEngineResult[] = data?.engines_results || [];
  const infectedEngines = engines.filter((e) => e.has_virus === true);
  const cleanCount = engines.filter((e) => e.has_virus === false).length;
  const otherCount = engines.filter((e) => e.has_virus == null).length;

  const filteredEngines = useMemo(() => {
    let list = engines;
    if (filter === "infected") list = list.filter((e) => e.has_virus === true);
    if (filter === "clean") list = list.filter((e) => e.has_virus === false);
    if (filter === "other") list = list.filter((e) => e.has_virus == null);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.engine_name.toLowerCase().includes(q) ||
          (e.malware_name || "").toLowerCase().includes(q) ||
          e.status_ar.includes(q),
      );
    }
    return list;
  }, [engines, filter, query]);

  const filterTabs: { id: EngineFilter; label: string; count: number }[] = [
    { id: "all", label: "الكل", count: engines.length },
    { id: "infected", label: "تهديدات", count: infectedEngines.length },
    { id: "clean", label: "سليم", count: cleanCount },
    { id: "other", label: "أخرى", count: otherCount },
  ];

  if (authLoading && !data) {
    return (
      <div className="flex justify-center py-24">
        <div className="loader-ring" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <p className="mb-2 text-sm text-[var(--fg-subtle)]">
          <Link href="/virus" className="hover:text-[var(--accent-bright)]">
            فحص الفيروسات
          </Link>
          {" / "}
          التقرير
        </p>
        <h1 className="display text-3xl sm:text-4xl">تقرير الفحص</h1>
        <p className="mt-2 max-w-xl text-[var(--fg-muted)]">
          ملخص نتائج محركات الحماية وتحليل الحالة الأمنية للهدف.
        </p>
      </ScrollReveal>

      {error && (
        <div
          className="mt-8 rounded-2xl border border-[var(--border)] p-6 text-[var(--danger)]"
          style={{ background: "var(--bg-elevated)" }}
        >
          {error}
        </div>
      )}

      {!error && (!data || polling) && (
        <div
          className="mt-12 flex flex-col items-center gap-5 rounded-2xl border border-[var(--border)] px-6 py-20"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="loader-ring" />
          <div className="text-center">
            <p className="display text-xl">جاري الفحص…</p>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              يتم تحليل الهدف عبر شبكة محركات الحماية. قد يستغرق هذا دقيقة أو أكثر.
            </p>
          </div>
        </div>
      )}

      {data?.verdict_summary && meta && (
        <>
          {/* Hero verdict */}
          <div
            className="relative mt-10 overflow-hidden rounded-3xl border border-[var(--border)] p-6 sm:p-10"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="pointer-events-none absolute -left-16 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full blur-3xl"
              style={{ background: meta.glow }}
              aria-hidden
            />
            <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:items-center">
              <SafetyRing
                percent={data.verdict_summary.safety_percentage}
                color={meta.color}
              />
              <div className="flex-1 text-center sm:text-start">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--fg-muted)]">
                  <meta.Icon size={14} style={{ color: meta.color }} />
                  الحكم النهائي
                </div>
                <h2
                  className="display mt-3 text-4xl sm:text-5xl"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </h2>
                <p className="mt-2 max-w-md text-[var(--fg-muted)]">
                  {meta.subtitle}
                </p>
                <p className="mt-4 text-sm text-[var(--fg-subtle)]">
                  شارك في التحليل{" "}
                  <strong className="text-[var(--fg)]">
                    {data.verdict_summary.total_engines}
                  </strong>{" "}
                  محرك حماية
                </p>
              </div>
            </div>

            <div className="relative mt-10 grid gap-3 sm:grid-cols-4">
              {(
                [
                  ["خبيث", data.verdict_summary.malicious, "var(--danger)"],
                  ["مشبوه", data.verdict_summary.suspicious, "var(--warning)"],
                  ["سليم", data.verdict_summary.harmless, "var(--success)"],
                  [
                    "غير مكتشف",
                    data.verdict_summary.undetected,
                    "var(--fg-muted)",
                  ],
                ] as const
              ).map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/40 px-4 py-5 text-center"
                >
                  <div className="display text-3xl" style={{ color }}>
                    {value}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Threat detections */}
          {infectedEngines.length > 0 && (
            <section className="mt-12">
              <h3 className="display text-xl">تهديدات مرصودة</h3>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                المحركات التي صنّفت الهدف كخبيث أو مشبوه
              </p>
              <Stagger className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {infectedEngines.map((e) => (
                  <StaggerItem key={e.engine_name}>
                    <div
                      className="rounded-2xl border border-[var(--border)] p-4 transition hover:border-[var(--danger)]/40"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{e.engine_name}</p>
                        <span className="rounded-md bg-[var(--danger)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--danger)]">
                          {e.status_ar}
                        </span>
                      </div>
                      <p
                        className="mt-2 truncate text-sm text-[var(--fg-muted)]"
                        dir="ltr"
                        title={e.malware_name || undefined}
                      >
                        {e.malware_name || "تهديد غير مسمّى"}
                      </p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {/* Engine matrix */}
          <section className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="display text-xl">مصفوفة المحركات</h3>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  تفاصيل نتيجة كل محرك حماية
                </p>
              </div>
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search
                  size={16}
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="بحث في المحركات…"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pe-3 ps-9 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filterTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                    filter === t.id
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  {t.id === "all" && <Filter size={14} />}
                  {t.label}
                  <span
                    className={cn(
                      "rounded-md px-1.5 text-[11px]",
                      filter === t.id
                        ? "bg-white/20"
                        : "bg-[var(--bg-soft)] text-[var(--fg-subtle)]",
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            <div
              className="mt-5 max-h-[32rem] overflow-auto rounded-2xl border border-[var(--border)]"
              style={{ background: "var(--bg-elevated)" }}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--bg-soft)] text-[var(--fg-muted)] backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">المحرك</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEngines.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-12 text-center text-[var(--fg-muted)]"
                      >
                        لا توجد نتائج لهذا التصفية
                      </td>
                    </tr>
                  )}
                  {filteredEngines.map((e) => (
                    <tr
                      key={e.engine_name}
                      className="border-t border-[var(--border)] transition hover:bg-[var(--accent-dim)]/30"
                    >
                      <td className="px-4 py-3 font-medium">{e.engine_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                            e.has_virus === true &&
                              "bg-[var(--danger)]/15 text-[var(--danger)]",
                            e.has_virus === false &&
                              "bg-[var(--success)]/15 text-[var(--success)]",
                            e.has_virus == null &&
                              "bg-[var(--bg-soft)] text-[var(--fg-muted)]",
                          )}
                        >
                          {e.status_ar}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-[var(--fg-muted)]"
                        dir="ltr"
                      >
                        {e.malware_name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/virus">
          <Button>فحص جديد</Button>
        </Link>
        <Link href="/virus">
          <Button variant="secondary">العودة</Button>
        </Link>
      </div>
    </div>
  );
}
