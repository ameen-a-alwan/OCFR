"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Tip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { RequireAccess } from "@/components/auth/RequireAccess";
import { formatDate } from "@/lib/utils";

export default function TipsManagePage() {
  const { token, canWriteTips } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("أمن سيبراني");
  const [tips, setTips] = useState<Tip[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // access gated by RequireAccess
  }, []);

  const load = async () => {
    if (!token) return;
    setTips(await api.tips.list(token));
  };

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await api.tips.create(token, { title, body, category });
      setTitle("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل النشر");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    await api.tips.remove(token, id);
    setTips((t) => t.filter((x) => x.id !== id));
  };

  if (!canWriteTips) {
    return (
      <RequireAccess permissions={["tips.write"]} title="نشر النصائح يتطلب صلاحية">
        <div />
      </RequireAccess>
    );
  }

  return (
    <RequireAccess permissions={["tips.write"]}>
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <ScrollReveal>
        <h1 className="display text-3xl">نشر نصيحة للتوعية</h1>
        <p className="mt-2 text-[var(--fg-muted)]">
          تظهر النصائح كشريط دوّار في الصفحة الرئيسية — وليس كصفحة كاملة.
        </p>
      </ScrollReveal>

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] p-6"
        style={{ background: "var(--bg-elevated)" }}
      >
        <input
          required
          placeholder="العنوان"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
        />
        <textarea
          required
          rows={4}
          placeholder="المحتوى"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
        />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "جاري النشر…" : "نشر في الشريط"}
          </Button>
          <Link href="/">
            <Button type="button" variant="secondary">
              عرض الرئيسية
            </Button>
          </Link>
        </div>
      </form>

      <ul className="mt-10 space-y-3">
        {tips.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] p-4"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div>
              <p className="font-semibold">{t.title}</p>
              <p className="text-xs text-[var(--fg-subtle)]">
                {t.category} · {formatDate(t.created_at)}
              </p>
            </div>
            <Button variant="ghost" onClick={() => onDelete(t.id)}>
              حذف
            </Button>
          </li>
        ))}
      </ul>
    </div>
    </RequireAccess>
  );
}
