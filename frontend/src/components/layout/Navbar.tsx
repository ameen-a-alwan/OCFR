"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Moon,
  Sun,
  Shield,
  LogOut,
  Home,
  ListTodo,
  BarChart3,
  Lightbulb,
  Users,
  Menu,
  X,
  Bug,
  ScrollText,
  KeyRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import { animate, stagger } from "animejs";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const baseLinks = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/virus", label: "فحص الفيروسات", icon: Bug },
  { href: "/logs", label: "تحليل السجلات", icon: ScrollText },
  { href: "/activity", label: "سجل العمليات", icon: ScrollText },
  { href: "/tasks", label: "المهام", icon: ListTodo },
  { href: "/performance", label: "الأداء", icon: BarChart3 },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout, canWriteTips, isAdmin, hasPermission } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const utilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const chips = [brandRef.current, dockRef.current, utilRef.current].filter(
      Boolean,
    ) as HTMLElement[];
    if (!chips.length) return;

    chips.forEach((c) => {
      c.style.opacity = "0";
      c.style.transform = "translateY(-18px)";
    });

    const anim = animate(chips, {
      opacity: [0, 1],
      y: [-18, 0],
      delay: stagger(90),
      duration: 750,
      ease: "outExpo",
    });

    const items = dockRef.current?.querySelectorAll("[data-nav-item]");
    if (items?.length) {
      animate(items, {
        opacity: [0, 1],
        scale: [0.85, 1],
        delay: stagger(45, { start: 200 }),
        duration: 500,
        ease: "outBack",
      });
    }

    return () => {
      anim.cancel();
    };
  }, []);

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
      <div ref={brandRef} className="fixed top-5 right-5 z-[60] hidden sm:block">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-[var(--shadow)] transition-all duration-300 hover:-translate-y-0.5",
            scrolled
              ? "glass border-[var(--border-strong)]"
              : "glass border-[var(--border)]",
          )}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl transition-transform duration-300 hover:rotate-6"
            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
          >
            <Shield size={16} />
          </span>
          <span className="display text-sm tracking-wide">درع</span>
        </Link>
      </div>

      <nav
        aria-label="التنقل الرئيسي"
        className="fixed top-5 left-1/2 z-[60] hidden -translate-x-1/2 md:block"
      >
        <div
          ref={dockRef}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-[var(--shadow)] transition-all duration-500",
            "glass border-[var(--border-strong)]",
            scrolled && "scale-[0.97] backdrop-blur-xl",
          )}
        >
          <LayoutGroup>
            {links.map((l) => {
              const active = pathname === l.href;
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  data-nav-item
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-300",
                    active
                      ? "text-white"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-[var(--accent)] shadow-[0_0_28px_rgba(30,111,255,0.4)]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon
                      size={15}
                      className={cn(
                        "transition-transform duration-300",
                        active && "scale-110",
                      )}
                    />
                    <span className="hidden lg:inline">{l.label}</span>
                  </span>
                </Link>
              );
            })}
          </LayoutGroup>
        </div>
      </nav>

      <div
        ref={utilRef}
        className="fixed top-5 left-5 z-[60] hidden items-center gap-1 rounded-full border px-2 py-1.5 glass border-[var(--border)] shadow-[var(--shadow)] sm:flex"
      >
        <button
          type="button"
          onClick={toggle}
          className="rounded-full p-2 text-[var(--fg-muted)] transition duration-300 hover:rotate-12 hover:bg-[var(--accent-dim)] hover:text-[var(--fg)]"
          aria-label="تبديل المظهر"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {user ? (
          <>
            <span className="hidden max-w-[7rem] truncate px-1 text-xs text-[var(--fg-muted)] xl:inline">
              {user.display_name}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-[var(--fg-muted)] transition duration-300 hover:bg-[var(--accent-dim)] hover:text-[var(--fg)]"
              aria-label="خروج"
            >
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
          >
            دخول
          </Link>
        )}
      </div>

      <div className="fixed top-4 left-4 right-4 z-[60] flex items-center justify-between md:hidden">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-2xl border border-[var(--border)] glass px-3 py-2 shadow-[var(--shadow)]"
        >
          <Shield size={16} className="text-[var(--accent)]" />
          <span className="display text-sm">درع</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-2xl border border-[var(--border)] glass p-2.5 shadow-[var(--shadow)]"
          aria-label="القائمة"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-x-4 top-20 z-[60] overflow-hidden rounded-3xl border border-[var(--border-strong)] glass p-3 shadow-[var(--shadow)] md:hidden"
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <div className="flex flex-col gap-1">
              {links.map((l, i) => {
                const Icon = l.icon;
                const active = pathname === l.href;
                return (
                  <motion.div
                    key={l.href}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i }}
                  >
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold",
                        active
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--fg-muted)]",
                      )}
                    >
                      <Icon size={16} />
                      {l.label}
                    </Link>
                  </motion.div>
                );
              })}
              <div className="mt-2 flex gap-2 border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={toggle}
                  className="flex-1 rounded-2xl border border-[var(--border)] py-2.5 text-sm"
                >
                  {theme === "dark" ? "وضع فاتح" : "وضع داكن"}
                </button>
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="flex-1 rounded-2xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white"
                  >
                    خروج
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-2xl bg-[var(--accent)] py-2.5 text-center text-sm font-bold text-white"
                  >
                    دخول
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
