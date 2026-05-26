"use client";

import { useMemo, useRef } from "react";
import { useScrollProgress } from "@/hooks/use-scroll-progress";

/*
  Scroll-driven hero:

  Phase 1 (0-15%):  "twix" displayed large, centered + "scroll to explore"
  Phase 2 (15-30%): "twix" letters dissolve into particles
  Phase 3 (28-80%): Word-by-word branching path appears (crossfades in as twix dissolves)
                    "Your" ── "thoughts" ── "branch."
                                  ●
                                  │
                         "Your" ── "AI" ── "should" ── "too."
  Phase 4 (80-90%): Subtitle fades in
  Phase 5 (90-100%): "Keep scrolling" hint
*/

// Deterministic scatter offsets for twix letters
function scatterOffsets(count: number, seed: number) {
  const offsets: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = Math.sin(seed + i * 127.1) * 43758.5453;
    const x = Math.sin(s) * 180 + (i % 2 === 0 ? -60 : 60);
    const y = Math.cos(s * 1.3) * 120 + (i % 3 === 0 ? -40 : 40);
    const r = Math.sin(s * 2.1) * 25;
    offsets.push({ x, y, r });
  }
  return offsets;
}

const TWIX = "twix".split("");
const LINE1 = ["Your", "thoughts", "branch."];
const LINE2 = ["Your", "AI", "should", "too."];
// Word steps: 3 words + fork + 4 words = 8 steps in the branching section
const WORD_STEPS = LINE1.length + 1 + LINE2.length; // 8

// Returns true if the user has prefers-reduced-motion. Safe during SSR.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BranchingHeadline() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Users who opted out of motion see the final state immediately.
  const progress = useScrollProgress(containerRef, {
    disabled: prefersReducedMotion(),
  });

  const twixOffsets = useMemo(() => scatterOffsets(TWIX.length, 42), []);

  // Sub-range helper
  const phase = (start: number, end: number) =>
    Math.max(0, Math.min(1, (progress - start) / (end - start)));

  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  // Twix dissolve: visible 0-25%, dissolves 12-25%
  const twixDissolve = phase(0.12, 0.25);
  const twixVisible = progress < 0.25;

  // Branching words: appear 22-70%, crossfades in as twix fades out
  const branchingVisible = progress >= 0.20;
  const branchingProgress = phase(0.25, 0.70);
  const wordStep = branchingProgress * WORD_STEPS;

  const line1Show = LINE1.map((_, i) => wordStep >= i + 0.5);
  const forkShow = wordStep >= LINE1.length + 0.5;
  const forkGrow = Math.min(1, Math.max(0, wordStep - LINE1.length) / 1);
  const line2Show = LINE2.map((_, i) => wordStep >= LINE1.length + 1 + i + 0.5);

  // Subtitle + hint — both finish earlier so there's no dead tail
  // between the hint appearing and the next section kicking in.
  const subtitleShow = phase(0.72, 0.82);
  const hintShow = phase(0.82, 0.92);

  return (
    <div ref={containerRef} style={{ height: "400vh" }}>
      <div
        className="sticky top-0 flex items-center justify-center"
        style={{ height: "100vh" }}
      >
        <div className="flex flex-col items-center px-6" style={{ minHeight: 280 }}>

          {/* ── "twix" logo (dissolves on scroll) ── */}
          {twixVisible && (
            <div
              className="absolute flex items-center justify-center"
              style={{
                opacity: 1 - ease(twixDissolve),
              }}
            >
              {TWIX.map((letter, i) => {
                const d = ease(twixDissolve);
                const off = twixOffsets[i];
                return (
                  <span
                    key={`t-${i}`}
                    className="text-6xl font-bold tracking-tight sm:text-8xl md:text-9xl"
                    style={{
                      color: "var(--color-text-primary)",
                      display: "inline-block",
                      transform: `translate(${off.x * d}px, ${off.y * d}px) rotate(${off.r * d}deg) scale(${1 - d * 0.3})`,
                      filter: `blur(${d * 5}px)`,
                      transition: "none",
                    }}
                  >
                    {letter}
                  </span>
                );
              })}

              {/* Scroll hint under twix */}
              {twixDissolve < 0.2 && (
                <div
                  className="absolute flex flex-col items-center gap-2"
                  style={{
                    top: "100%",
                    marginTop: 32,
                    opacity: 1 - twixDissolve * 5,
                  }}
                >
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                    scroll to explore
                  </p>
                  <svg
                    className="h-5 w-5 scroll-hint"
                    style={{ color: "var(--color-text-muted)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              )}
            </div>
          )}

          {/* ── Branching word path (crossfades in) ── */}
          {branchingVisible && (
            <div
              className="flex flex-col items-center"
              style={{
                opacity: Math.min(1, phase(0.22, 0.32) * 2),
                transition: "none",
              }}
            >
              {/* Line 1 */}
              <div className="flex items-center justify-center flex-wrap gap-y-1">
                {LINE1.map((word, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && (
                      <span
                        className="inline-block w-4 sm:w-9"
                        style={{
                          height: 2.5,
                          borderRadius: 2,
                          margin: "0 4px",
                          background: line1Show[i] ? "rgba(217,119,87,0.3)" : "transparent",
                          transition: "background 0.4s ease",
                        }}
                      />
                    )}
                    <span
                      className="text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
                      style={{
                        color: "var(--color-text-primary)",
                        opacity: line1Show[i] ? 1 : 0,
                        transform: line1Show[i] ? "translateY(0)" : "translateY(16px)",
                        transition: "opacity 0.5s ease, transform 0.5s ease",
                        display: "inline-block",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {word}
                    </span>
                  </span>
                ))}
              </div>

              {/* Fork node + line */}
              <div
                className="flex flex-col items-center"
                style={{ opacity: forkShow ? 1 : 0, transition: "opacity 0.4s ease" }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "rgba(217,119,87,0.45)",
                    marginTop: 16,
                    boxShadow: forkShow ? "0 0 20px rgba(217,119,87,0.3)" : "none",
                  }}
                />
                <div
                  style={{
                    width: 2.5,
                    height: 36,
                    borderRadius: 2,
                    background: "rgba(217,119,87,0.3)",
                    transformOrigin: "top",
                    transform: `scaleY(${ease(forkGrow)})`,
                  }}
                />
              </div>

              {/* Line 2 */}
              <div className="flex items-center justify-center flex-wrap gap-y-1" style={{ marginTop: 8 }}>
                {LINE2.map((word, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && (
                      <span
                        className="inline-block w-3 sm:w-7"
                        style={{
                          height: 2.5,
                          borderRadius: 2,
                          margin: "0 4px",
                          background: line2Show[i] ? "rgba(217,119,87,0.3)" : "transparent",
                          transition: "background 0.4s ease",
                        }}
                      />
                    )}
                    <span
                      className="text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
                      style={{
                        color: "var(--color-accent)",
                        opacity: line2Show[i] ? 1 : 0,
                        transform: line2Show[i] ? "translateY(0)" : "translateY(16px)",
                        transition: "opacity 0.5s ease, transform 0.5s ease",
                        display: "inline-block",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {word}
                    </span>
                  </span>
                ))}
              </div>

              {/* Subtitle */}
              <p
                className="mt-8 sm:mt-10 max-w-2xl text-base sm:text-lg leading-relaxed md:text-xl text-center"
                style={{
                  color: "var(--color-text-secondary)",
                  opacity: subtitleShow,
                  transform: `translateY(${(1 - ease(subtitleShow)) * 10}px)`,
                  transition: "none",
                }}
              >
                Explore any tangent without losing context. Branch, merge, and
                build — all in one conversation.
              </p>

              {/* Keep scrolling hint */}
              <div
                className="mt-8 flex flex-col items-center gap-2"
                style={{ opacity: hintShow, transition: "none" }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Keep scrolling
                </p>
                <svg
                  className="h-5 w-5 scroll-hint"
                  style={{ color: "var(--color-text-muted)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
