"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  AUTH_NODES,
  FREE_NODES,
  LOGIN_NODE,
} from "@/lib/hub-nodes";
import { ShieldEmblem } from "./ShieldEmblem";
import { HubNodeButton } from "./HubNodeButton";
import { ConnectorLines, useHubConnectors } from "./ConnectorLines";
import { consumeSkipHubIntro } from "@/lib/hub-intro";

type Phase = "wait" | "logo" | "forge" | "settle" | "menu" | "ready";

function introStatus(phase: Phase) {
  if (phase === "wait" || phase === "logo") return "درع";
  if (phase === "forge") return "تشكيل الدرع";
  if (phase === "settle") return "تثبيت الحماية";
  return "";
}

function emblemPhase(
  phase: Phase,
): "logo" | "forge" | "settle" | "menu" | "ready" {
  if (phase === "wait") return "logo";
  if (phase === "menu") return "ready";
  return phase as "logo" | "forge" | "settle" | "ready";
}

export function ShieldHub() {
  const { user, logout, isAdmin, hasPermission, canWriteTips } = useAuth();
  const { theme, toggle } = useTheme();

  const [phase, setPhase] = useState<Phase>("wait");
  const [forgeProgress, setForgeProgress] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const nodeMapRef = useRef(new Map<string, HTMLElement>());

  const finishIntro = useCallback(() => {
    setPhase("ready");
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const frames: number[] = [];

    if (consumeSkipHubIntro()) {
      setForgeProgress(1);
      setPhase("ready");
      return;
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      setForgeProgress(1);
      finishIntro();
      return;
    }

    setPhase("logo");

    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        setPhase("forge");
        const start = performance.now();
        const dur = 1500;
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / dur);
          setForgeProgress(1 - Math.pow(1 - t, 3));
          if (t < 1) {
            frames.push(requestAnimationFrame(tick));
          } else {
            setPhase("settle");
            timers.push(
              window.setTimeout(() => {
                if (cancelled) return;
                setPhase("menu");
                timers.push(
                  window.setTimeout(() => {
                    if (cancelled) return;
                    finishIntro();
                  }, 900),
                );
              }, 900),
            );
          }
        };
        frames.push(requestAnimationFrame(tick));
      }, 500),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
    };
  }, [finishIntro]);

  const authNodes = useMemo(() => {
    if (!user) return [LOGIN_NODE];
    return AUTH_NODES.filter((n) => {
      if (n.adminOnly && !isAdmin) return false;
      if (n.permission && !hasPermission(n.permission)) return false;
      if (
        n.anyPermission &&
        n.anyPermission.length > 0 &&
        !n.anyPermission.some((p) => hasPermission(p))
      ) {
        return false;
      }
      return true;
    });
  }, [user, isAdmin, hasPermission]);

  const freeNodes = FREE_NODES;
  const hubActive = phase === "settle" || phase === "menu" || phase === "ready";
  const buttonsReveal = phase === "menu" || phase === "ready";
  const introFocus = phase === "wait" || phase === "logo" || phase === "forge";

  const sideMap = useMemo(() => {
    const m = new Map<string, "free" | "auth">();
    freeNodes.forEach((n) => m.set(n.id, "free"));
    authNodes.forEach((n) => m.set(n.id, "auth"));
    return m;
  }, [freeNodes, authNodes]);

  const connectorKey = useMemo(
    () =>
      buttonsReveal
        ? [...freeNodes, ...authNodes].map((n) => n.id).join("|")
        : "",
    [buttonsReveal, freeNodes, authNodes],
  );

  const setNodeRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodeMapRef.current.set(id, el);
      else nodeMapRef.current.delete(id);
    },
    [],
  );

  const lines = useHubConnectors(
    stageRef,
    shieldRef,
    nodeMapRef,
    sideMap,
    buttonsReveal,
    connectorKey,
  );

  return (
    <div className="relative h-[100svh] overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      {/* Ambient corner lights — green (free) ↔ blue (auth) */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        <motion.div
          className="absolute -top-[40%] -end-[38%] h-[130vmin] w-[130vmin] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(34,197,94,0.48) 0%, rgba(34,197,94,0.22) 32%, rgba(34,197,94,0.08) 55%, transparent 78%)",
          }}
          animate={{
            x: [0, -48, -16, 0],
            y: [0, 34, 56, 0],
            scale: [1, 1.2, 1.08, 1],
            opacity: [0.8, 1, 0.88, 0.8],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-[42%] -start-[36%] h-[135vmin] w-[135vmin] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(30,111,255,0.5) 0%, rgba(77,143,255,0.24) 30%, rgba(77,143,255,0.08) 54%, transparent 78%)",
          }}
          animate={{
            x: [0, 52, 18, 0],
            y: [0, -36, -58, 0],
            scale: [1, 1.16, 1.24, 1],
            opacity: [0.75, 1, 0.86, 0.75],
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8,
          }}
        />
        {/* Soft mid wash so corners meet in the center */}
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 85% 70% at 50% 48%, rgba(20,40,80,0.32), transparent 80%)",
          }}
          animate={{ opacity: [0.5, 0.78, 0.58, 0.5] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Intro focus glow on the shield */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: introFocus ? 0.9 : 0.4,
            background:
              "radial-gradient(ellipse 70% 60% at 50% 48%, var(--hero-glow), transparent 75%)",
          }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <motion.div
        className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between"
        initial={false}
        animate={{
          opacity: hubActive ? 1 : 0,
          y: hubActive ? 0 : -8,
        }}
        transition={{
          duration: 0.55,
          delay: hubActive ? 0.15 : 0,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ pointerEvents: hubActive ? "auto" : "none" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-[var(--fg-muted)]"
            aria-label="تبديل المظهر"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {user && (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--fg-muted)]"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{user.display_name}</span>
            </button>
          )}
        </div>
        {canWriteTips && (
          <Link
            href="/tips"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--accent-bright)]"
          >
            نشر نصيحة
          </Link>
        )}
      </motion.div>

      {/* —— Desktop hub (unchanged layout) —— */}
      <div className="relative z-10 mx-auto hidden h-full w-full max-w-5xl items-center px-6 py-14 lg:flex">
        <div
          ref={stageRef}
          className="relative grid w-full grid-cols-[minmax(0,1fr)_minmax(180px,240px)_minmax(0,1fr)] items-center gap-6"
        >
          <ConnectorLines lines={lines} visible={buttonsReveal} />

          <motion.div
            className="flex flex-col items-end justify-center gap-5"
            initial={false}
            animate={{ opacity: buttonsReveal ? 1 : 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: buttonsReveal ? "auto" : "none" }}
          >
            {freeNodes.map((node, i) => (
              <HubNodeButton
                key={node.id}
                node={node}
                index={i}
                side="free"
                nodeRef={setNodeRef(node.id)}
                reveal={buttonsReveal}
              />
            ))}
          </motion.div>

          <motion.div
            ref={shieldRef}
            className="flex shrink-0 flex-col items-center justify-center"
            initial={false}
            animate={{
              scale: introFocus ? 1.22 : 1,
              y: introFocus ? -12 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 110,
              damping: 20,
              mass: 0.95,
            }}
          >
            <ShieldEmblem
              phase={emblemPhase(phase)}
              forgeProgress={forgeProgress}
            />
          </motion.div>

          <motion.div
            className="flex flex-col items-start justify-center gap-5"
            initial={false}
            animate={{ opacity: buttonsReveal ? 1 : 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: buttonsReveal ? "auto" : "none" }}
          >
            {authNodes.map((node, i) => (
              <HubNodeButton
                key={node.id}
                node={node}
                index={i + freeNodes.length}
                side="auth"
                nodeRef={setNodeRef(node.id)}
                reveal={buttonsReveal}
              />
            ))}
          </motion.div>
        </div>
      </div>

      {/* —— Mobile hub —— */}
      <div className="relative z-10 flex h-full w-full flex-col px-5 pb-6 pt-16 lg:hidden">
        <motion.div
          className="mx-auto flex w-full max-w-[200px] shrink-0 flex-col items-center"
          initial={false}
          animate={{
            scale: introFocus ? 1.15 : 0.92,
            y: introFocus ? 40 : 0,
          }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          <ShieldEmblem
            phase={emblemPhase(phase)}
            forgeProgress={forgeProgress}
            layoutId="dar3-shield-mobile"
          />
        </motion.div>

        <motion.div
          className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain"
          initial={false}
          animate={{ opacity: buttonsReveal ? 1 : 0 }}
          transition={{ duration: 0.45 }}
          style={{ pointerEvents: buttonsReveal ? "auto" : "none" }}
        >
          <div className="mx-auto flex max-w-sm flex-col items-center gap-1 pb-4">
            {freeNodes.map((node, i) => (
              <HubNodeButton
                key={`m-${node.id}`}
                node={node}
                index={i}
                side="free"
                reveal={buttonsReveal}
                compact
              />
            ))}

            <div className="my-3 h-px w-16 bg-[var(--border)]" />

            {authNodes.map((node, i) => (
              <HubNodeButton
                key={`m-${node.id}`}
                node={node}
                index={i + freeNodes.length}
                side="auth"
                reveal={buttonsReveal}
                compact
              />
            ))}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {introFocus || phase === "settle" ? (
          <motion.p
            key="intro-status"
            className="pointer-events-none absolute bottom-10 left-1/2 z-30 -translate-x-1/2 text-[11px] tracking-[0.35em] text-[var(--fg-subtle)]"
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: phase === "settle" ? 0.35 : 0.85,
              y: 0,
            }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45 }}
          >
            {introStatus(phase)}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
