import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[var(--accent)]" />
          <span className="text-sm text-[var(--fg-muted)]">درع — منصة الحماية الذكية</span>
        </div>
        <p className="text-sm text-[var(--fg-subtle)]">
          وثائق OCFR · مهام · أداء · توعية
        </p>
      </div>
    </footer>
  );
}
