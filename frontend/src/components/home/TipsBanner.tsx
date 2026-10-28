"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Lightbulb, ChevronLeft, ChevronRight } from "lucide-react";
import { api, type Tip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export function TipsBanner() {
  const { token } = useAuth();
  const [tips, setTips] = useState<Tip[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.tips
      .list(token)
      .then((data) => setTips(data))
      .catch(() => setTips([]));
  }, [token]);

  useEffect(() => {
    if (tips.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % tips.length);
    }, 5500);
    return () => clearInterval(id);
  }, [tips.length]);

  if (tips.length === 0) return null;

  const tip = tips[index % tips.length];

  return (
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
      <div
        className="banner-shimmer relative overflow-hidden rounded-2xl border border-[var(--border-strong)] p-5 sm:p-6"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-bright)]">
            <Lightbulb size={16} />
            <span>نصيحة أمنية</span>
            <span className="rounded-md bg-[var(--accent-dim)] px-2 py-0.5 text-xs">
              {tip.category}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="السابق"
              className="rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--accent-dim)] hover:text-[var(--fg)]"
              onClick={() =>
                setIndex((i) => (i - 1 + tips.length) % tips.length)
              }
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              aria-label="التالي"
              className="rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--accent-dim)] hover:text-[var(--fg)]"
              onClick={() => setIndex((i) => (i + 1) % tips.length)}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        <div className="relative min-h-[5.5rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={tip.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3 className="display text-lg sm:text-xl">{tip.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--fg-muted)] sm:text-base">
                {tip.body}
              </p>
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">
                {tip.author_name} · {formatDate(tip.created_at)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex gap-1.5">
          {tips.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-label={`نصيحة ${i + 1}`}
              onClick={() => setIndex(i)}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background:
                  i === index % tips.length
                    ? "var(--accent)"
                    : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
