"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, ScrollText } from "lucide-react";
import { api, type LogReportMeta } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { formatDate } from "@/lib/utils";

export default function LogsPage() {
  const { token, hasPermission } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reports, setReports] = useState<LogReportMeta[]>([]);
  const canAnalyze = hasPermission("logs.analyze");
  const canRead = hasPermission("logs.read");

  const loadReports = async () => {
    if (!token || !canRead) return;
    try {
      const res = await api.logs.list(token);
      setReports(res.reports || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  const onAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !token || !canAnalyze) return;
    setBusy(true);
    setFeedback("");
    try {
      const res = await api.logs.analyze(token, file);
      router.push(`/logs/results/${res.id}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "فشل التحليل");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAccess
      anyPermission={["logs.analyze", "logs.read"]}
      title="تحليل السجلات يتطلب صلاحية"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ScrollReveal>
          <div className="flex items-start gap-3">
            <ScrollText className="mt-1 text-[var(--accent-bright)]" size={28} />
            <div>
              <h1 className="display text-3xl sm:text-4xl">تحليل السجلات</h1>
              <p className="mt-2 max-w-2xl text-[var(--fg-muted)]">
                ارفع تصدير Windows Event Viewer (txt/log) للحصول على تقرير تهديدات،
                أنشطة المهاجمين، وإثراء عناوين IP مع مخططات جغرافية.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {canAnalyze && (
          <div
            className="mt-10 rounded-2xl border border-[var(--border)] p-6 sm:p-8"
            style={{ background: "var(--bg-elevated)" }}
          >
            <form onSubmit={onAnalyze} className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-14 transition hover:bg-[var(--accent-dim)]">
                <input
                  type="file"
                  accept=".txt,.log,.csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <FileUp className="mb-3 text-[var(--accent)]" />
                <span className="font-semibold">
                  {file ? file.name : "اختر ملف سجل (txt · log · csv)"}
                </span>
              </label>
              <Button type="submit" disabled={!file || busy}>
                {busy ? "جاري التحليل…" : "تحليل السجل"}
              </Button>
              {feedback && (
                <p className="text-sm text-[var(--danger)]">{feedback}</p>
              )}
            </form>
          </div>
        )}

        {canRead && reports.length > 0 && (
          <div className="mt-12">
            <h2 className="display text-xl">تقاريري السابقة</h2>
            <ul
              className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]"
              style={{ background: "var(--bg-elevated)" }}
            >
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <p className="font-semibold">{r.filename}</p>
                    <p className="text-sm text-[var(--fg-subtle)]">
                      {formatDate(r.created_at)}
                    </p>
                  </div>
                  <Link href={`/logs/results/${r.id}`}>
                    <Button variant="secondary" type="button">
                      عرض التقرير
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </RequireAccess>
  );
}
