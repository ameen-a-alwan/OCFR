"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { HubNodeDef } from "@/lib/hub-nodes";
import { cn } from "@/lib/utils";

/**
 * Layout is forced LTR so tip↔title order is stable under page `dir=rtl`:
 * - free (right of shield): tip then title → tip faces the shield
 * - auth (left of shield): title then tip → tip faces the shield
 */
export function HubNodeButton({
  node,
  index,
  side,
  onActivate,
  nodeRef,
  reveal,
  compact,
}: {
  node: HubNodeDef;
  index: number;
  side: "free" | "auth";
  onActivate?: (node: HubNodeDef) => boolean | void;
  nodeRef?: (el: HTMLElement | null) => void;
  reveal?: boolean;
  /** Mobile: title only, no tip spacer */
  compact?: boolean;
}) {
  const fromX = side === "free" ? 24 : -24;
  const isFree = side === "free";

  return (
    <motion.div
      ref={nodeRef}
      data-hub-node={node.id}
      dir={compact ? "rtl" : "ltr"}
      className={cn(
        "flex w-full items-center",
        compact ? "justify-center gap-0" : "gap-7",
        !compact &&
          (isFree
            ? "justify-center lg:justify-end"
            : "justify-center lg:justify-start"),
      )}
      initial={false}
      animate={reveal ? { opacity: 1, x: 0 } : { opacity: 0, x: fromX }}
      transition={{
        delay: reveal ? (compact ? 0.15 : 0.8) + index * 0.07 : 0,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {!compact && isFree && (
        <span data-hub-tip className="block h-1.5 w-1.5 shrink-0" aria-hidden />
      )}

      <Link
        href={node.href}
        dir="rtl"
        onClick={(e) => {
          if (onActivate?.(node)) e.preventDefault();
        }}
        className={cn(
          "hub-title group relative inline-block max-w-full px-1 py-1.5",
          "focus-visible:outline-none",
        )}
      >
        <span
          className={cn(
            "display relative z-10 block text-[clamp(1rem,2.2vw,1.25rem)] tracking-wide transition-colors duration-200",
            "text-[var(--fg-muted)] group-hover:text-[var(--accent-bright)] group-focus-visible:text-[var(--accent-bright)]",
          )}
        >
          {node.label}
        </span>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-1 bottom-0.5 h-[2px] origin-center scale-x-0 rounded-full",
            "bg-gradient-to-l from-[var(--accent-bright)] to-[var(--accent)]",
            "transition-transform duration-300 ease-out",
            "group-hover:scale-x-100 group-focus-visible:scale-x-100",
            "shadow-[0_0_14px_color-mix(in_srgb,var(--accent-bright)_50%,transparent)]",
          )}
        />
      </Link>

      {!compact && !isFree && (
        <span data-hub-tip className="block h-1.5 w-1.5 shrink-0" aria-hidden />
      )}
    </motion.div>
  );
}
