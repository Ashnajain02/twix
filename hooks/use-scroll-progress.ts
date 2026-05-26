"use client";

import { useEffect, useState, type RefObject } from "react";

interface Options {
  /**
   * When true, the hook short-circuits to `1` and skips installing the
   * scroll listener — useful for `prefers-reduced-motion` users who should
   * see the final state immediately rather than animations.
   */
  disabled?: boolean;
}

/**
 * Tracks how far the user has scrolled through a sticky-scroll container.
 *
 * The container should be tall (many vh) with a sticky-positioned child that
 * stays in the viewport while the user scrolls. Progress maps:
 *   0 → container top just hit the viewport top
 *   1 → container bottom just hit the viewport bottom
 *
 * Used by `BranchingHeadline`, `ScrollWalkthrough`, and `ArchitectureFlow`
 * to drive their scroll-linked animations.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  { disabled = false }: Options = {}
): number {
  const [progress, setProgress] = useState(disabled ? 1 : 0);

  useEffect(() => {
    if (disabled) return;

    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      const rect = el.getBoundingClientRect();
      setProgress(Math.max(0, Math.min(1, -rect.top / total)));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref, disabled]);

  return progress;
}
