"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { markSkipHubIntro } from "@/lib/hub-intro";

export function SubBackButton() {
  return (
    <Link
      href="/"
      onClick={() => markSkipHubIntro()}
      className="fixed top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] text-[var(--fg-muted)] shadow-[var(--shadow)] backdrop-blur-md transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
      style={{ insetInlineStart: "1rem" }}
      aria-label="رجوع"
    >
      <X size={18} strokeWidth={2.25} />
    </Link>
  );
}
