"use client";

import { useEffect, useRef } from "react";
import { animate, createTimeline, stagger } from "animejs";

/** Scroll-triggered reveal powered by Anime.js + IntersectionObserver */
export function AnimeReveal({
  children,
  className,
  staggerMs = 90,
}: {
  children: React.ReactNode;
  className?: string;
  staggerMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = el.querySelectorAll("[data-anime]");
    if (!targets.length) return;

    targets.forEach((t) => {
      const node = t as HTMLElement;
      node.style.opacity = "0";
      node.style.transform = "translate3d(0, 40px, 0)";
    });

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played.current) return;
        played.current = true;
        animate(targets, {
          opacity: [0, 1],
          y: [40, 0],
          delay: stagger(staggerMs),
          duration: 950,
          ease: "outExpo",
        });
        io.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [staggerMs]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function useHeroAnime(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const brand = el.querySelectorAll("[data-hero-brand]");
    const lines = el.querySelectorAll("[data-hero-line]");
    const sub = el.querySelectorAll("[data-hero-sub]");
    const cta = el.querySelectorAll("[data-hero-cta]");
    const deco = el.querySelectorAll("[data-hero-deco]");

    const tl = createTimeline({ defaults: { ease: "outExpo" } });

    tl.add(brand, {
      opacity: [0, 1],
      y: [56, 0],
      scale: [0.9, 1],
      duration: 1100,
    })
      .add(
        lines,
        {
          opacity: [0, 1],
          y: [70, 0],
          delay: stagger(140),
          duration: 1200,
        },
        "-=750",
      )
      .add(
        sub,
        {
          opacity: [0, 1],
          y: [28, 0],
          duration: 850,
        },
        "-=750",
      )
      .add(
        cta,
        {
          opacity: [0, 1],
          y: [22, 0],
          delay: stagger(100),
          duration: 750,
        },
        "-=600",
      )
      .add(
        deco,
        {
          opacity: [0, 1],
          scale: [0.85, 1],
          duration: 1300,
        },
        "-=1100",
      );

    let floatAnim: ReturnType<typeof animate> | undefined;
    if (deco.length) {
      floatAnim = animate(deco, {
        translateY: [
          { to: -10, duration: 2400, ease: "inOutSine" },
          { to: 0, duration: 2400, ease: "inOutSine" },
        ],
        loop: true,
      });
    }

    return () => {
      tl.cancel();
      floatAnim?.cancel();
    };
  }, [root]);
}
