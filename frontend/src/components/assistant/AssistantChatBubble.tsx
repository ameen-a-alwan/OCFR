"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, ExternalLink, MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; uri: string }>;
};

const INTRO =
  "أنا المساعد الذكي لشعبة الأمن السيبراني والذكاء الاصطناعي في قسم تقنية المعلومات — الأمانة العامة لمجلس الوزراء في العراق. اسأل عن الأمن السيبراني أو الذكاء الاصطناعي. للإبلاغ عن حادثة استخدم صفحة البلاغ الأمني.";

/** Turn /tickets (and ` /tickets `) into a real link; leave other text as-is. */
function renderMessageText(text: string, onNavigate?: () => void) {
  const parts = text.split(/(`?\/tickets`?|\(\/?tickets\))/gi);
  return parts.map((part, i) => {
    if (/^`?\/tickets`?$/i.test(part) || /^\(\/?tickets\)$/i.test(part)) {
      return (
        <a
          key={`t-${i}`}
          href="/tickets"
          target="_blank"
          rel="noreferrer"
          onClick={onNavigate}
          className="font-semibold underline underline-offset-2 text-[var(--accent-bright)] hover:opacity-90"
        >
          صفحة البلاغ الأمني
        </a>
      );
    }
    return <span key={`t-${i}`}>{part}</span>;
  });
}

export function AssistantChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { id: "intro", role: "assistant", content: INTRO },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 220);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput("");
    setError("");
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "intro")
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api.assistant.chat({
        message: text,
        history: history.slice(0, -1),
      });
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          sources: res.sources,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الطلب");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-5 z-[80]"
      dir="ltr"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="assistant-panel"
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-auto absolute bottom-[calc(100%+0.75rem)] left-0 flex w-[min(100vw-2.5rem,22.5rem)] origin-bottom-left flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
            style={{
              background: "var(--bg-elevated)",
              height: "min(32rem, calc(100svh - 7rem))",
            }}
            role="dialog"
            aria-label="المساعد الذكي"
            dir="rtl"
          >
            <header className="flex items-start gap-2 border-b border-[var(--border)] px-3 py-3">
              <Bot className="mt-0.5 shrink-0 text-[var(--accent)]" size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--fg)]">
                  المساعد الذكي
                </p>
                <p className="text-[11px] leading-snug text-[var(--fg-muted)]">
                  شعبة الأمن السيبراني والذكاء الاصطناعي
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    m.role === "user"
                      ? "mr-auto bg-[var(--accent)] text-white"
                      : "ml-auto border border-[var(--border)] bg-[var(--bg-soft)] text-[var(--fg)]",
                  )}
                >
                  <p className="whitespace-pre-wrap">
                    {m.role === "assistant"
                      ? renderMessageText(m.content)
                      : m.content}
                  </p>
                  {m.sources && m.sources.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--fg-muted)]">
                      {m.sources.map((s) => (
                        <li key={s.uri}>
                          <a
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--accent-bright)] hover:underline"
                          >
                            <ExternalLink size={11} />
                            {s.title || s.uri}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {busy && (
                <p className="text-xs text-[var(--fg-subtle)]">جاري التفكير…</p>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[var(--border)] px-3 py-2">
              <Link
                href="/tickets"
                className="text-[11px] text-[var(--accent-bright)] hover:underline"
                onClick={() => setOpen(false)}
              >
                تقديم بلاغ أمني ←
              </Link>
            </div>

            <form
              onSubmit={onSend}
              className="flex gap-2 border-t border-[var(--border)] p-2.5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اسأل عن الأمن السيبراني أو الذكاء الاصطناعي…"
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-3 text-white disabled:opacity-50"
                aria-label="إرسال"
              >
                <Send size={16} />
              </button>
            </form>

            {error && (
              <p className="px-3 pb-2 text-xs text-[var(--danger)]">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_32px_rgba(30,111,255,0.45)] transition hover:bg-[var(--accent-bright)]",
          open && "ring-2 ring-[var(--accent-bright)] ring-offset-2 ring-offset-[var(--bg)]",
        )}
        aria-label={open ? "إغلاق المساعد" : "فتح المساعد الذكي"}
        aria-expanded={open}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: -40, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 40, scale: 0.7 }}
            transition={{ duration: 0.18 }}
            className="inline-flex"
          >
            {open ? <X size={22} /> : <MessageCircle size={22} />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
