"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] shadow-[0_0_24px_rgba(47,107,255,0.25)]",
  secondary:
    "border border-[var(--border-strong)] bg-transparent text-[var(--fg)] hover:bg-[var(--accent-dim)]",
  ghost: "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--accent-dim)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
