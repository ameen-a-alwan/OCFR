"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Home,
  Bug,
  ScrollText,
  ListTodo,
  BarChart3,
  Lightbulb,
  Users,
  KeyRound,
} from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const baseLinks = [
  { href: "/", label: "المحور", icon: Home },
  { href: "/virus", label: "الفيروسات", icon: Bug },
  { href: "/logs", label: "السجلات", icon: ScrollText },
  { href: "/activity", label: "العمليات", icon: ScrollText },
  { href: "/tasks", label: "المهام", icon: ListTodo },
  { href: "/performance", label: "الأداء", icon: BarChart3 },
];

export function InnerNav() {
  const pathname = usePathname();
  const { user, logout, canWriteTips, isAdmin, hasPermission } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const links = [
    ...baseLinks,
    ...(canWriteTips
      ? [{ href: "/tips", label: "نصيحة", icon: Lightbulb }]
      : []),
    ...(isAdmin ? [{ href: "/users", label: "المستخدمون", icon: Users }] : []),
    ...(hasPermission("roles.manage")
      ? [{ href: "/permissions", label: "الصلاحيات", icon: KeyRound }]
      : []),
  ];

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
            >
              <Shield size={15} />
            </span>
            <span className="display text-sm">درع</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active = pathname === l.href;
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  <Icon size={13} />
                  <span className="hidden lg:inline">{l.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-2 text-[var(--fg-muted)]"
              aria-label="المظهر"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {user ? (
              <button
                type="button"
                onClick={logout}
                className="hidden rounded-lg p-2 text-[var(--fg-muted)] sm:inline-flex"
                aria-label="خروج"
              >
                <LogOut size={15} />
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white"
              >
                دخول
              </Link>
            )}
            <button
              type="button"
              className="rounded-lg p-2 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="القائمة"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-x-3 top-16 z-50 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow)] md:hidden"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {links.map((l) => {
              const Icon = l.icon;
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--fg-muted)]",
                  )}
                >
                  <Icon size={15} />
                  {l.label}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
