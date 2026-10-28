"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/animations/ScrollReveal";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <ScrollReveal>
        <div
          className="rounded-2xl border border-[var(--border)] p-8 shadow-[var(--shadow)]"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <span
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
            >
              <Shield size={28} />
            </span>
            <h1 className="display text-2xl">تسجيل الدخول</h1>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              منصة الحماية الذكية
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--fg-muted)]">
                اسم المستخدم
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--fg-muted)]">
                كلمة المرور
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                required
              />
            </label>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري التحقق…" : "تسجيل الدخول"}
            </Button>
          </form>
        </div>
      </ScrollReveal>
    </div>
  );
}
