"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/* ─── Content ──────────────────────────────────────────────────── */
const USER_MSG = "Hey! What is Twix and what can it do?";

const ASSISTANT_FULL = `**Twix** is an AI workspace where conversations work like your brain does — non-linearly.

Instead of one long thread, you can open **branching conversations** on any topic within your chat. Highlight any text, explore a tangent, then merge your findings back.

It also includes a **cloud sandbox** for running code, and **real-time web search** so every answer stays current and cited.

Think of it as the AI chat you've been wanting — one that actually keeps up with how you think.`;

const ASSISTANT_WORDS = ASSISTANT_FULL.split(" ");
const HIGHLIGHT_PHRASE = "branching conversations";
const TANGENT_USER_MSG = "How does branching work exactly?";

const TANGENT_FULL = `It's simple — **highlight any text** in a response and click 'Open tangent'. A focused side panel opens that inherits the full conversation context.

You can explore as deep as you want — tangents can have their own tangents. When you're done, hit **Merge** to fold your findings back into the main thread with an AI-generated summary.

Nothing gets lost. The main conversation stays clean while you explore every rabbit hole.`;

const TANGENT_WORDS = TANGENT_FULL.split(" ");

/* ─── Markdown renderer ────────────────────────────────────────── */
function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part.split("\n").map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ));
      })}
    </>
  );
}

/* ─── Assistant text with highlight ────────────────────────────── */
function AssistantText({
  words,
  count,
  highlight,
}: {
  words: string[];
  count: number;
  highlight: boolean;
}) {
  const text = words.slice(0, count).join(" ");
  const marker = `**${HIGHLIGHT_PHRASE}**`;
  const idx = text.indexOf(marker);

  if (idx === -1) return <Md text={text} />;

  const before = text.slice(0, idx);
  const after = text.slice(idx + marker.length);

  return (
    <>
      <Md text={before} />
      <span className={`wt-highlight ${highlight ? "wt-highlight-active" : ""}`}>
        <strong style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
          {HIGHLIGHT_PHRASE}
        </strong>
      </span>
      <Md text={after} />
    </>
  );
}

/* ─── Main ─────────────────────────────────────────────────────── */
export function ScrollWalkthrough() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      setP(Math.max(0, Math.min(1, -rect.top / total)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Phases — spread out with breathing room before merge
  const showUser = p > 0.03;
  const showAst = p > 0.08;
  const astCount = Math.floor(ASSISTANT_WORDS.length * Math.min(1, Math.max(0, (p - 0.08) / 0.22)));
  const hl = p > 0.32;
  const popup = p > 0.37 && p < 0.43;
  const tOpen = p > 0.43 && p < 0.82;
  const tUser = p > 0.48;
  const tAst = p > 0.52;
  const tAstCount = Math.floor(TANGENT_WORDS.length * Math.min(1, Math.max(0, (p - 0.52) / 0.16)));
  // Tangent answer fully visible at ~0.68. Merge at 0.82 = 14% gap (~100vh of just reading)
  const merged = p > 0.82;
  const cta = p > 0.92;

  return (
    <div ref={scrollRef} style={{ height: "700vh" }}>
      {/* Fixed full-viewport app frame — z-index above nav (z-50) */}
      <div
        className="fixed inset-0 z-[60] flex flex-col"
        style={{
          background: "var(--color-bg-base)",
          opacity: p > 0 || (scrollRef.current && scrollRef.current.getBoundingClientRect().top <= 0) ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 0.3s ease",
        }}
      >
        {/* App title bar */}
        <div
          className="flex items-center gap-2 border-b px-5 py-3 shrink-0"
          style={{ background: "var(--color-bg-sidebar)", borderColor: "var(--color-border)" }}
        >
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full" style={{ background: "#FF5F57" }} />
            <div className="h-3 w-3 rounded-full" style={{ background: "#FEBC2E" }} />
            <div className="h-3 w-3 rounded-full" style={{ background: "#28C840" }} />
          </div>
          <div className="flex-1 text-center">
            <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>twix</span>
          </div>
        </div>

        {/* App body — stacks vertically on mobile, side-by-side on lg */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* Sidebar */}
          <div
            className="hidden sm:flex flex-col w-56 shrink-0 border-r p-3"
            style={{ background: "var(--color-bg-sidebar)", borderColor: "var(--color-border)" }}
          >
            <div
              className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New conversation
            </div>
            <div
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: "rgba(217,119,87,0.1)", color: "var(--color-accent)" }}
            >
              What is Twix?
            </div>
          </div>

          {/* Main chat — on mobile: shrinks to 30% when tangent is open */}
          <div
            className="flex flex-col min-w-0 relative"
            style={{
              flex: "1 1 0%",
              transition: "flex 0.5s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div className="flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
              <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
                {/* Empty state */}
                {!showUser && (
                  <div className="flex flex-col items-center justify-center pt-32 text-center">
                    <Image src="/logo.svg" alt="" width={40} height={40} className="h-10 w-10 opacity-40 mb-4" />
                    <p className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
                      How can I help you today?
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                      Highlight any response text to open a tangent thread
                    </p>
                  </div>
                )}

                {/* User message */}
                {showUser && (
                  <div
                    className="flex justify-end"
                    style={{
                      opacity: showUser ? 1 : 0,
                      transform: `translateY(${showUser ? 0 : 12}px)`,
                      transition: "opacity 0.4s ease, transform 0.4s ease",
                    }}
                  >
                    <div
                      className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-[0.9375rem]"
                      style={{
                        background: "var(--color-bg-user-msg)",
                        color: "var(--color-text-primary)",
                        border: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      {USER_MSG}
                    </div>
                  </div>
                )}

                {/* Assistant message */}
                {showAst && astCount > 0 && (
                  <div
                    className="flex items-start gap-3"
                    style={{
                      opacity: showAst ? 1 : 0,
                      transform: `translateY(${showAst ? 0 : 12}px)`,
                      transition: "opacity 0.4s ease, transform 0.4s ease",
                    }}
                  >
                    <Image src="/logo.svg" alt="" width={24} height={24} className="h-6 w-6 mt-1.5 shrink-0 opacity-70" />
                    <div className="text-sm sm:text-[0.9375rem] leading-relaxed sm:leading-[1.7]" style={{ color: "var(--color-text-secondary)" }}>
                      <AssistantText words={ASSISTANT_WORDS} count={astCount} highlight={hl} />
                    </div>
                  </div>
                )}

                {/* Merge indicator — clickable to view merged conversation */}
                {merged && (
                  <div
                    className="flex items-center gap-2"
                    style={{
                      opacity: merged ? 1 : 0,
                      transform: `translateX(${merged ? 0 : -16}px)`,
                      transition: "opacity 0.5s ease, transform 0.5s ease",
                      pointerEvents: "auto",
                    }}
                  >
                    <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                    <button
                      onClick={() => setMergeModalOpen(true)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-all"
                      style={{
                        background: "rgba(34,197,94,0.08)",
                        color: "var(--color-success)",
                        border: "none",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(34,197,94,0.15)";
                        e.currentTarget.style.transform = "scale(1.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(34,197,94,0.08)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Merged: &quot;{HIGHLIGHT_PHRASE}&quot;
                      <svg className="h-3 w-3 ml-0.5" style={{ opacity: 0.6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                  </div>
                )}

                {/* Final CTA */}
                {cta && (
                  <div
                    className="flex justify-center pt-4"
                    style={{ opacity: cta ? 1 : 0, transition: "opacity 0.5s ease" }}
                  >
                    <Link
                      href="/register"
                      className="landing-btn-primary landing-btn-lg"
                      style={{ pointerEvents: "auto" }}
                    >
                      Try Twix — Free
                      <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Selection popup */}
            {popup && (
              <div
                className="absolute z-20"
                style={{
                  top: "42%",
                  left: "38%",
                  opacity: popup ? 1 : 0,
                  transform: `translateY(${popup ? 0 : 6}px)`,
                  transition: "opacity 0.25s ease, transform 0.25s ease",
                }}
              >
                <div
                  className="flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm shadow-lg"
                  style={{
                    background: "var(--color-bg-elevated)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  Open tangent
                  <svg className="h-4 w-4" style={{ color: "var(--color-text-secondary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            )}

            {/* Input (visual only) */}
            <div className="shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="mx-auto max-w-2xl">
                <div
                  className="flex items-center gap-2 sm:gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
                >
                  <span className="flex-1 text-sm sm:text-[0.9375rem]" style={{ color: "var(--color-text-muted)" }}>
                    Message Twix...
                  </span>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center" style={{ background: "var(--color-accent)" }}>
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tangent panel — side-by-side 50/50 on lg, 70/30 stacked on mobile */}
          <div
            className={`flex flex-col border-t lg:border-t-0 lg:border-l ${tOpen ? "wt-tangent-mobile-open" : ""}`}
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg-base)",
              flex: tOpen ? "1 1 0%" : "0 0 0px",
              opacity: tOpen ? 1 : 0,
              overflow: "hidden",
              transition: "flex 0.5s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease",
            }}
          >
            {/* Header */}
            <div
              className="flex items-start gap-2 border-b px-4 py-3 shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-text-muted)" }} />
              <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                &quot;{HIGHLIGHT_PHRASE}&quot;
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ color: "var(--color-success)", border: "1px solid var(--color-success)" }}
                >
                  Merge
                </span>
                <span className="rounded-md p-1" style={{ color: "var(--color-text-muted)" }}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Tangent messages */}
            <div className="flex-1 overflow-hidden px-4 py-4 space-y-4">
              {tUser && (
                <div className="flex justify-end" style={{ opacity: tUser ? 1 : 0, transition: "opacity 0.4s ease" }}>
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
                    style={{
                      background: "var(--color-bg-user-msg)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    {TANGENT_USER_MSG}
                  </div>
                </div>
              )}

              {tAst && tAstCount > 0 && (
                <div className="flex items-start gap-2.5" style={{ opacity: tAst ? 1 : 0, transition: "opacity 0.4s ease" }}>
                  <Image src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5 mt-0.5 shrink-0 opacity-60" />
                  <div className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    <Md text={TANGENT_WORDS.slice(0, tAstCount).join(" ")} />
                  </div>
                </div>
              )}
            </div>

            {/* Tangent input — matches main chat input */}
            <div className="shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4" style={{ borderColor: "var(--color-border)" }}>
              <div
                className="flex items-center gap-2 sm:gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
              >
                <span className="flex-1 text-sm sm:text-[0.9375rem]" style={{ color: "var(--color-text-muted)" }}>Reply...</span>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center" style={{ background: "var(--color-accent)" }}>
                  <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll progress bar at very bottom */}
        <div className="shrink-0 h-1" style={{ background: "var(--color-bg-active)" }}>
          <div
            className="h-full"
            style={{
              background: "var(--color-accent)",
              width: `${p * 100}%`,
              transition: "width 0.05s linear",
            }}
          />
        </div>

        {/* Merge modal — shows full tangent conversation */}
        {mergeModalOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(4px)",
              pointerEvents: "auto",
            }}
            onClick={() => setMergeModalOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
              style={{
                background: "var(--color-bg-base)",
                borderColor: "var(--color-border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div
                className="flex items-center justify-between px-5 py-3 border-b"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg-sidebar)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: "var(--color-success)" }}
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Merged tangent: &quot;{HIGHLIGHT_PHRASE}&quot;
                  </span>
                </div>
                <button
                  onClick={() => setMergeModalOpen(false)}
                  className="rounded-md p-1 transition-colors"
                  style={{ color: "var(--color-text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal body — tangent conversation */}
              <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Tangent user message */}
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-3 text-sm"
                    style={{
                      background: "var(--color-bg-user-msg)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    {TANGENT_USER_MSG}
                  </div>
                </div>

                {/* Tangent assistant message */}
                <div className="flex items-start gap-2.5">
                  <Image src="/logo.svg" alt="" width={24} height={24} className="h-6 w-6 mt-1 shrink-0 opacity-70" />
                  <div className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    <Md text={TANGENT_FULL} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
