"use client";

import { usePathname } from "next/navigation";
import { SubBackButton } from "./SubBackButton";
import { useAuth } from "@/lib/auth";
import { AssistantChatBubble } from "@/components/assistant/AssistantChatBubble";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();
  const isHub = pathname === "/";
  const isNews = pathname === "/news";

  if (isHub) {
    return (
      <div className="relative h-[100svh] overflow-hidden bg-[var(--bg)]">
        {children}
        <AssistantChatBubble />
      </div>
    );
  }

  // News page owns its own chrome (back + fullscreen)
  if (isNews) {
    return (
      <div className="relative min-h-screen bg-[var(--bg)]">
        {children}
        <AssistantChatBubble />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg)]">
      {!loading && <SubBackButton />}
      <main className="relative z-10 min-h-screen">{children}</main>
      <AssistantChatBubble />
    </div>
  );
}
