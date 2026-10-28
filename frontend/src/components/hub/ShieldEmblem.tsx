"use client";

import Image from "next/image";
import { motion } from "framer-motion";

/** Classic heraldic shield — slightly wider at the top for the seal */
const SHIELD =
  "M60 6 C82 10 102 20 108 38 L108 58 C106 90 86 116 60 134 C34 116 14 90 12 58 L12 38 C18 20 38 10 60 6 Z";

type Phase = "logo" | "forge" | "settle" | "menu" | "ready";

export function ShieldEmblem({
  phase,
  forgeProgress,
  layoutId = "dar3-shield",
}: {
  phase: Phase;
  forgeProgress: number;
  layoutId?: string;
}) {
  const settled = phase === "settle" || phase === "menu" || phase === "ready";
  const showRing = phase !== "logo";
  const length = 340;
  const dash = Math.max(0, length * (1 - forgeProgress));

  return (
    <motion.div
      layoutId={layoutId}
      className="relative mx-auto aspect-[120/140] w-full max-w-[220px] sm:max-w-[260px]"
      transition={{
        layout: { type: "spring", stiffness: 120, damping: 22, mass: 0.9 },
      }}
    >
      <motion.div
        className="absolute inset-0"
        animate={{
          scale: settled ? 1 : 1.06,
          opacity: 1,
        }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg viewBox="0 0 120 140" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="hubShieldFill" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgba(30, 70, 140, 0.22)" />
              <stop offset="45%" stopColor="var(--bg-soft)" />
              <stop offset="100%" stopColor="var(--bg-elevated)" />
            </linearGradient>
            <linearGradient id="hubGoldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f0d878" />
              <stop offset="40%" stopColor="#d4af37" />
              <stop offset="70%" stopColor="#a67c00" />
              <stop offset="100%" stopColor="#e8c547" />
            </linearGradient>
            <filter id="hubGoldSoft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse
            cx="60"
            cy="132"
            rx="30"
            ry="4"
            fill="currentColor"
            className="text-black/20"
            opacity={settled ? 0.55 : 0.3}
          />

          {showRing && (
            <>
              <path
                d={SHIELD}
                fill="url(#hubShieldFill)"
                stroke="var(--border-strong)"
                strokeWidth="1"
                opacity={0.35 + forgeProgress * 0.65}
              />
              {/* Forge outline in gold to echo the seal rim */}
              <path
                d={SHIELD}
                fill="none"
                stroke="url(#hubGoldStroke)"
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={length}
                strokeDasharray={length}
                strokeDashoffset={dash}
                filter="url(#hubGoldSoft)"
                opacity={0.7 + forgeProgress * 0.3}
              />
              {/* Subtle blue accent line */}
              <path
                d="M60 11 C80 14 98 23 103 38 L103 57 C101 86 84 110 60 126 C36 110 19 86 17 57 L17 38 C22 23 40 14 60 11 Z"
                fill="none"
                stroke="var(--accent-bright)"
                strokeWidth="0.7"
                opacity={forgeProgress * 0.35}
              />
            </>
          )}
        </svg>
      </motion.div>

      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center pb-[10%]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <Image
          src="/logo.png"
          alt="درع"
          width={112}
          height={112}
          priority
          className="h-[48%] w-auto max-w-[56%] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
        />
      </motion.div>
    </motion.div>
  );
}
