"use client";

import { useEffect, useRef, useState } from "react";
import { animate, createTimeline, stagger } from "animejs";

export function LoadingScreen({ ready }: { ready: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);
  const started = useRef(false);
  const progress = useRef({ value: 0 });

  useEffect(() => {
    if (!root.current || started.current) return;
    started.current = true;

    const mark = root.current.querySelector(".load-mark");
    const line = root.current.querySelector(".load-line");
    const brand = root.current.querySelectorAll(".load-brand-char");
    const pct = root.current.querySelector(".load-pct");
    if (!mark || !line || !pct || !brand.length) return;

    createTimeline({ defaults: { ease: "outCubic" } })
      .add(mark, {
        opacity: [0, 1],
        scale: [0.7, 1],
        duration: 600,
      })
      .add(
        brand,
        {
          opacity: [0, 1],
          y: [24, 0],
          delay: stagger(55),
          duration: 650,
        },
        "-=350",
      )
      .add(
        line,
        {
          scaleX: [0, 1],
          duration: 900,
          ease: "inOutQuart",
        },
        "-=500",
      )
      .add(
        pct,
        {
          opacity: [0, 1],
          duration: 400,
        },
        "-=800",
      );

    animate(progress.current, {
      value: 100,
      duration: 1600,
      ease: "inOutQuad",
      onUpdate: () => {
        if (percentRef.current) {
          percentRef.current.textContent = `${Math.round(progress.current.value)}%`;
        }
      },
    });
  }, []);

  useEffect(() => {
    if (!ready || !root.current || !visible) return;

    const el = root.current;
    const panel = el.querySelector(".load-panel");
    if (!panel) return;

    const tl = createTimeline({
      defaults: { ease: "inOutCubic" },
      onComplete: () => setVisible(false),
    });

    tl.add(panel, {
      opacity: 0,
      y: -30,
      filter: ["blur(0px)", "blur(8px)"],
      duration: 480,
    }).add(
      el,
      {
        opacity: [1, 0],
        duration: 420,
        ease: "outQuad",
      },
      "-=200",
    );

    return () => {
      tl.cancel();
    };
  }, [ready, visible]);

  if (!visible) return null;

  return (
    <div
      ref={root}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 45%, var(--accent-dim), transparent 70%)",
        }}
      />

      <div className="load-panel relative flex w-[min(90vw,22rem)] flex-col items-center gap-7">
        <div
          className="load-mark flex h-12 w-12 items-center justify-center rounded-2xl opacity-0"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"
              stroke="var(--accent-bright)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          className="display flex gap-[0.15em] text-4xl tracking-wide sm:text-5xl"
          aria-label="درع"
        >
          {"درع".split("").map((ch, i) => (
            <span key={i} className="load-brand-char inline-block opacity-0">
              {ch}
            </span>
          ))}
        </div>

        <div className="flex w-full flex-col gap-3">
          <div className="h-px w-full overflow-hidden bg-[var(--border)]">
            <div
              className="load-line h-full origin-right"
              style={{
                background: "var(--accent)",
                transform: "scaleX(0)",
              }}
            />
          </div>
          <div className="load-pct flex justify-between text-[11px] tracking-[0.2em] text-[var(--fg-subtle)] opacity-0">
            <span>LOADING</span>
            <span ref={percentRef}>0%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
