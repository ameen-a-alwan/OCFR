"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type LinePoint = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  side: "free" | "auth";
};

export function ConnectorLines({
  lines = [],
  visible,
}: {
  lines?: LinePoint[];
  visible: boolean;
}) {
  // Framer Motion SVG paths SSR differently than the client — mount after hydrate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const safe = lines ?? [];
  if (!mounted) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="wireFree" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,197,94,0.08)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0.65)" />
        </linearGradient>
        <linearGradient id="wireAuth" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="rgba(30,111,255,0.08)" />
          <stop offset="100%" stopColor="rgba(77,143,255,0.7)" />
        </linearGradient>
      </defs>
      {safe.map((l, i) => {
        const midX = (l.x1 + l.x2) / 2;
        const d = `M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`;
        const stroke = l.side === "free" ? "url(#wireFree)" : "url(#wireAuth)";
        const dot = l.side === "free" ? "#22c55e" : "#4d8fff";
        const delay = 0.06 * i;
        return (
          <g key={l.id}>
            <motion.path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                visible
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{
                duration: 0.75,
                delay,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
            <motion.circle
              cx={l.x2}
              cy={l.y2}
              r="2.75"
              fill={dot}
              initial={{ opacity: 0, scale: 0 }}
              animate={
                visible
                  ? { opacity: 0.9, scale: 1 }
                  : { opacity: 0, scale: 0 }
              }
              transition={{
                duration: 0.28,
                delay: delay + 0.65,
                ease: "easeOut",
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function useHubConnectors(
  stageRef: React.RefObject<HTMLElement | null>,
  shieldRef: React.RefObject<HTMLElement | null>,
  nodeMapRef: React.RefObject<Map<string, HTMLElement>>,
  sides: Map<string, "free" | "auth">,
  active: boolean,
  layoutKey: string,
) {
  const [lines, setLines] = useState<LinePoint[]>([]);

  useEffect(() => {
    if (!active) {
      const t = requestAnimationFrame(() => setLines([]));
      return () => cancelAnimationFrame(t);
    }

    const measure = () => {
      const stage = stageRef.current;
      const shield = shieldRef.current;
      const nodeEls = nodeMapRef.current;
      if (!stage || !shield || !nodeEls) return;
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setLines([]);
        return;
      }
      const sr = stage.getBoundingClientRect();
      const sh = shield.getBoundingClientRect();
      const cx = sh.left + sh.width / 2 - sr.left;
      const cy = sh.top + sh.height / 2 - sr.top;

      const next: LinePoint[] = [];
      nodeEls.forEach((el, id) => {
        const side = sides.get(id) || "auth";
        const tip = el.querySelector("[data-hub-tip]") as HTMLElement | null;
        const target = (tip ?? el).getBoundingClientRect();
        // Aim at the tip marker near the text edge facing the shield
        const nx = target.left + target.width / 2 - sr.left;
        const ny = target.top + target.height / 2 - sr.top;
        const dx = nx - cx;
        const dy = ny - cy;
        const len = Math.hypot(dx, dy) || 1;
        const rim = Math.min(sh.width, sh.height) * 0.38;
        next.push({
          id,
          x1: cx + (dx / len) * rim,
          y1: cy + (dy / len) * rim,
          x2: nx,
          y2: ny,
          side,
        });
      });
      setLines(next);
    };

    measure();
    const id = window.setTimeout(measure, 120);
    const id2 = window.setTimeout(measure, 450);
    const ro = new ResizeObserver(() => measure());
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(id);
      clearTimeout(id2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stageRef, shieldRef, nodeMapRef, sides, active, layoutKey]);

  return lines;
}
