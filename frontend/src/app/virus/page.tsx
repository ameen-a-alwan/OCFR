"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bug, FileUp, Link2, History } from "lucide-react";
import { api, type VirusHistoryItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { cn, formatDate } from "@/lib/utils";

type Tab = "file" | "url" | "history";

const VERDICT_AR: Record<string, string> = {
  clean: "نظيف",
  suspicious: "مشبوه",
  infected: "مصاب",
};

export default function VirusPage() {
  const router = useRouter();
  const { token, user, hasPermission, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<VirusHistoryItem[]>([]);
  const [stats, setStats] = useState<{
    total_scans: number;
    infected: number;
    suspicious: number;
    clean: number;
    queued: number;
  } | null>(null);

  const canHistory = !!user && hasPermission("virus.history");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] =
    [
      { id: "file", label: "فحص ملف", icon: <FileUp size={16} />, show: true },
      { id: "url", label: "فحص رابط", icon: <Link2 size={16} />, show: true },
      {
        id: "history",
        label: "السجل",
        icon: <History size={16} />,
        show: canHistory,
      },
    ];

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    const run = async () => {
      if (!token) return;
      try {
        const [h, s] = await Promise.all([
          api.virus.history(token, 40),
          api.virus.statistics(token),
        ]);
        if (cancelled) return;
        setHistory(h.data || []);
        setStats(s.data);
      } catch {
        /* ignore */
      }
    };
    const id = requestAnimationFrame(() => {
      void run();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [tab, token]);

  const onScanFile = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setFeedback("");
    try {
      const res = await api.virus.scanFile(file, token);
      const id = res.data?.id;
      if (!id) throw new Error("لم يُرجع معرف التحليل");
      router.push(`/virus/results/${encodeURIComponent(id)}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "فشل الفحص");
    } finally {
      setBusy(false);
    }
  };

  const onScanUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setFeedback("");
    try {
      const res = await api.virus.scanUrl(url.trim(), token);
      const id = res.data?.id;
      if (!id) throw new Error("لم يُرجع معرف التحليل");
      router.push(`/virus/results/${encodeURIComponent(id)}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "فشل الفحص");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="loader-ring" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <div className="flex items-start gap-3">
          <Bug className="mt-1 text-[var(--accent-bright)]" size={28} />
          <div>
            <h1 className="display text-3xl sm:text-4xl">فحص الفيروسات</h1>
            <p className="mt-2 max-w-2xl text-[var(--fg-muted)]">
              ارفع ملفاً أو أدخل رابطاً لفحصه عبر شبكة محركات الحماية — متاح
              للجميع. سجل الدخول لعرض سجل الفحوصات.
            </p>
          </div>
        </div>
      </ScrollReveal>

      <div className="mt-8 flex flex-wrap gap-2">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setFeedback("");
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                tab === t.id
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      <div
        className="mt-8 rounded-2xl border border-[var(--border)] p-6 sm:p-8"
        style={{ background: "var(--bg-elevated)" }}
      >
        {tab === "file" && (
          <form onSubmit={onScanFile} className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-14 transition hover:bg-[var(--accent-dim)]">
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <FileUp className="mb-3 text-[var(--accent)]" />
              <span className="font-semibold">
                {file ? file.name : "اختر أي ملف للفحص"}
              </span>
              <span className="mt-1 text-sm text-[var(--fg-subtle)]">
                الحد الأقصى 32 ميجابايت
              </span>
            </label>
            <Button type="submit" disabled={!file || busy}>
              {busy ? "جاري الإرسال…" : "بدء الفحص"}
            </Button>
          </form>
        )}

        {tab === "url" && (
          <form onSubmit={onScanUrl} className="space-y-4">
            <label className="block text-sm font-semibold text-[var(--fg-muted)]">
              الرابط
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                dir="ltr"
              />
            </label>
            <Button type="submit" disabled={!url.trim() || busy}>
              {busy ? "جاري الإرسال…" : "فحص الرابط"}
            </Button>
          </form>
        )}

        {tab === "history" && canHistory && (
          <div className="space-y-6">
            {stats && (
              <div className="grid gap-3 sm:grid-cols-5">
                {(
                  [
                    ["الكل", stats.total_scans],
                    ["نظيف", stats.clean],
                    ["مشبوه", stats.suspicious],
                    ["مصاب", stats.infected],
                    ["قيد الانتظار", stats.queued],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[var(--border)] px-3 py-3 text-center"
                  >
                    <div className="display text-2xl">{value}</div>
                    <div className="text-xs text-[var(--fg-muted)]">{label}</div>
                  </div>
                ))}
              </div>
            )}
            <ul className="divide-y divide-[var(--border)]">
              {history.length === 0 && (
                <li className="py-8 text-center text-[var(--fg-muted)]">
                  لا يوجد سجل فحوصات بعد
                </li>
              )}
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-semibold" dir="auto">
                      {item.target}
                    </p>
                    <p className="text-sm text-[var(--fg-subtle)]">
                      {item.scan_type === "url" ? "رابط" : "ملف"} ·{" "}
                      {formatDate(item.created_at)} ·{" "}
                      {item.verdict
                        ? VERDICT_AR[item.verdict] || item.verdict
                        : item.status}
                    </p>
                  </div>
                  {item.analysis_id && (
                    <Link
                      href={`/virus/results/${encodeURIComponent(item.analysis_id)}`}
                    >
                      <Button variant="secondary" type="button">
                        النتيجة
                      </Button>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback && (
          <p className="mt-4 text-sm text-[var(--danger)]">{feedback}</p>
        )}
      </div>
    </div>
  );
}
