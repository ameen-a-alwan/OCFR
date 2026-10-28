"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  X,
} from "lucide-react";
import { api, type Tip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";

const ROTATE_MS = 30_000;

export default function NewsPage() {
  const { token } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [docFs, setDocFs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.tips
      .list(token)
      .then((data) => {
        if (!cancelled) setTips(data);
      })
      .catch(() => {
        if (!cancelled) setTips([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onFs = () => setDocFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const count = tips.length;
  const tip = count ? tips[index % count] : null;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!count) return;
      setIndex((i) => (i + dir + count) % count);
      setProgress(0);
    },
    [count],
  );

  const progressRef = useRef(0);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!count || paused || loading) return;
    let raf = 0;
    const start = performance.now();
    const base = progressRef.current;

    const tick = (now: number) => {
      const next = Math.min(1, base + (now - start) / ROTATE_MS);
      setProgress(next);
      if (next >= 1) {
        setIndex((i) => (i + 1) % count);
        setProgress(0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, paused, loading, index]);

  const toggleImmersive = async () => {
    const next = !immersive;
    setImmersive(next);
    try {
      if (next && rootRef.current && !document.fullscreenElement) {
        await rootRef.current.requestFullscreen?.();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      /* CSS immersive still works */
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex flex-col bg-[var(--bg)] text-[var(--fg)]",
        immersive
          ? "fixed inset-0 z-[80] h-[100dvh]"
          : "min-h-[100svh]",
      )}
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 35%, var(--hero-glow), transparent 70%)",
        }}
      />

      {/* Chrome */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] text-[var(--fg-muted)] backdrop-blur-md transition hover:text-[var(--fg)]"
          aria-label="رجوع"
        >
          <X size={18} />
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            aria-label={paused ? "تشغيل" : "إيقاف مؤقت"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            type="button"
            onClick={toggleImmersive}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            aria-label={immersive || docFs ? "تصغير" : "ملء الشاشة"}
          >
            {immersive || docFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Stage */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-14 pb-10 pt-2 sm:px-20 md:px-24">
        {loading && (
          <div className="loader-ring" />
        )}

        {!loading && !tip && (
          <p className="text-center text-[var(--fg-muted)]">
            لا توجد نصائح أو أخبار حالياً.
          </p>
        )}

        {!loading && tip && (
          <>
            <div className="relative w-full max-w-3xl">
              {/* Progress track */}
              <div className="mb-8 h-[3px] w-full overflow-hidden rounded-full bg-[var(--border)]">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.05, ease: "linear" }}
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.article
                  key={tip.id}
                  initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -20, filter: "blur(4px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center"
                  onMouseEnter={() => setPaused(true)}
                  onMouseLeave={() => setPaused(false)}
                >
                  <span className="inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--accent-dim)] px-3 py-1 text-xs font-bold text-[var(--accent-bright)]">
                    {tip.category || "عام"}
                  </span>

                  <h1 className="display mt-6 text-[clamp(1.75rem,5vw,3.25rem)] leading-[1.2]">
                    {tip.title}
                  </h1>

                  <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,2.4vw,1.25rem)] leading-[1.85] text-[var(--fg-muted)]">
                    {tip.body}
                  </p>

                  <div className="mt-8 text-sm">
                    <p className="font-semibold text-[var(--fg-muted)]">
                      {tip.author_name}
                    </p>
                    {tip.created_at && (
                      <p className="mt-1 text-[var(--fg-subtle)]">
                        {formatDate(tip.created_at)}
                      </p>
                    )}
                  </div>
                </motion.article>
              </AnimatePresence>

              {/* Nav arrows — outside content, correct RTL direction */}
              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="absolute top-1/2 left-0 z-20 flex h-11 w-11 -translate-x-2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--fg-muted)] backdrop-blur-sm transition hover:text-[var(--fg)] sm:-translate-x-14 md:-translate-x-16"
                    aria-label="السابق"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="absolute top-1/2 right-0 z-20 flex h-11 w-11 translate-x-2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--fg-muted)] backdrop-blur-sm transition hover:text-[var(--fg)] sm:translate-x-14 md:translate-x-16"
                    aria-label="التالي"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {count > 1 && (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                {tips.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={`عرض ${i + 1}`}
                    onClick={() => {
                      setIndex(i);
                      setProgress(0);
                    }}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === index % count
                        ? "w-8 bg-[var(--accent)]"
                        : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--fg-subtle)]",
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
