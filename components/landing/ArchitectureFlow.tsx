"use client";

import { useRef } from "react";
import { useScrollProgress } from "@/hooks/use-scroll-progress";

/**
 * "Follow the Message" — a compact sticky-scroll walkthrough.
 *
 * As the user scrolls, they advance through 6 short stages of the Twix
 * pipeline. A pipeline rail at the top stays visible the whole time, so
 * the user always sees where they are in the journey.
 */

// ─── Stage definitions ──────────────────────────────────────────────

interface Stage {
  id: string;
  label: string;
  title: string;
  shortLabel: string;
  description: string;
  detail: string;
  visual: "message" | "tree" | "embedding" | "knowledge" | "compress" | "stream";
  icon: (active: boolean) => React.ReactNode;
}

const iconStroke = (active: boolean) => ({
  stroke: active ? "var(--color-bg-elevated)" : "var(--color-text-secondary)",
  fill: "none",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const STAGES: Stage[] = [
  {
    id: "message",
    label: "01",
    title: "Message arrives",
    shortLabel: "Send",
    description: "Someone asks a question from a deep tangent.",
    detail: '"What restaurants should we try?"',
    visual: "message",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: "tree",
    label: "02",
    title: "Find the thread",
    shortLabel: "Trace",
    description: "We grab the full conversation path in one query.",
    detail: "Travel → Japan → Tokyo → here",
    visual: "tree",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M7.5 7.5l3.5 8.5M16.5 7.5l-3.5 8.5" />
      </svg>
    ),
  },
  {
    id: "embedding",
    label: "03",
    title: "Pick what matters",
    shortLabel: "Search",
    description: "Find the most relevant past messages.",
    detail: "6 best matches",
    visual: "embedding",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
  {
    id: "compress",
    label: "04",
    title: "Shrink the rest",
    shortLabel: "Compress",
    description: "Keep recent stuff full. Summarize the old.",
    detail: "200 tokens, not 5,000",
    visual: "compress",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <path d="M4 8h16M4 12h16M4 16h10" />
        <path d="m18 14 3 2-3 2" />
      </svg>
    ),
  },
  {
    id: "knowledge",
    label: "05",
    title: "Remember the gist",
    shortLabel: "Distill",
    description: "Old chats become structured notes.",
    detail: "Facts · decisions · prefs",
    visual: "knowledge",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      </svg>
    ),
  },
  {
    id: "stream",
    label: "06",
    title: "AI replies",
    shortLabel: "Stream",
    description: "A tiny, precise context — fast answer.",
    detail: "First token in ~100ms",
    visual: "stream",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke(a)}>
        <path d="M4 12h6M4 7h10M4 17h8" />
        <path d="m16 12 4-4v8z" fill={a ? "var(--color-bg-elevated)" : "var(--color-text-secondary)"} stroke="none" />
      </svg>
    ),
  },
];

// ─── Visual components for each stage ───────────────────────────────

function MessageVisual({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-2xl px-5 py-3 text-sm max-w-[240px] sm:max-w-[280px]"
        style={{
          background: "var(--color-bg-user-msg)",
          border: "1px solid var(--color-border-subtle)",
          color: "var(--color-text-primary)",
          opacity: Math.min(1, progress * 3),
          transform: `translateY(${(1 - Math.min(1, progress * 3)) * 12}px)`,
        }}
      >
        What restaurants should we try?
      </div>
      <svg
        width="24" height="32" viewBox="0 0 24 32"
        style={{
          opacity: Math.min(1, Math.max(0, (progress - 0.3) * 4)),
          color: "var(--color-accent)",
        }}
      >
        <path d="M12 0v24M6 18l6 8 6-8" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div
        className="rounded-lg px-3 py-1.5 text-xs font-medium"
        style={{
          background: "var(--color-accent-subtle)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent-border)",
          opacity: Math.min(1, Math.max(0, (progress - 0.5) * 4)),
        }}
      >
        POST /api/chat
      </div>
    </div>
  );
}

function TreeVisual({ progress }: { progress: number }) {
  const nodes = [
    { label: "Travel", depth: 0, x: 50, y: 16 },
    { label: "Japan trip", depth: 1, x: 50, y: 44 },
    { label: "Tokyo", depth: 2, x: 50, y: 72 },
    { label: "Current", depth: 3, x: 50, y: 100, active: true },
  ];
  const revealCount = Math.floor(progress * (nodes.length + 1));

  return (
    <svg viewBox="0 0 100 116" className="w-full max-w-[200px] sm:max-w-[260px]" style={{ overflow: "visible" }}>
      {nodes.slice(1).map((node, i) => (
        <line
          key={`l-${i}`}
          x1={nodes[i].x} y1={nodes[i].y + 8}
          x2={node.x} y2={node.y - 4}
          stroke={i + 1 < revealCount ? "var(--color-accent)" : "var(--color-border)"}
          strokeWidth="1.5"
          strokeDasharray={i + 1 < revealCount ? "0" : "3 3"}
          style={{ transition: "stroke 0.5s ease, stroke-dasharray 0.5s ease" }}
        />
      ))}
      {nodes.map((node, i) => {
        const visible = i < revealCount;
        return (
          <g key={`n-${i}`} style={{ opacity: visible ? 1 : 0.2, transition: "opacity 0.4s ease" }}>
            <circle
              cx={node.x} cy={node.y} r={node.active ? 6 : 4.5}
              fill={node.active ? "var(--color-accent)" : visible ? "var(--color-text-muted)" : "var(--color-border)"}
              style={{ transition: "fill 0.4s ease" }}
            />
            {node.active && visible && (
              <circle
                cx={node.x} cy={node.y} r={10}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1"
                opacity={0.3}
              >
                <animate attributeName="r" from="8" to="14" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <text
              x={node.x + (node.active ? 12 : 10)}
              y={node.y + 4}
              fontSize="7"
              fill={node.active ? "var(--color-accent)" : "var(--color-text-secondary)"}
              fontWeight={node.active ? 600 : 400}
              fontFamily="inherit"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmbeddingVisual({ progress }: { progress: number }) {
  const messages = [
    { text: "Loves sushi and ramen", sim: 0.89, hit: true },
    { text: "Budget ~$50 per meal", sim: 0.85, hit: true },
    { text: "Hiking trail tips", sim: 0.23, hit: false },
    { text: "Vegetarian options", sim: 0.82, hit: true },
    { text: "No shellfish", sim: 0.79, hit: true },
    { text: "Train pass prices", sim: 0.18, hit: false },
  ];

  return (
    <div className="space-y-1.5 w-full max-w-[260px] sm:max-w-[300px]">
      {messages.map((msg, i) => {
        const delay = i * 0.1;
        const visible = progress > delay;
        return (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: msg.hit
                ? "rgba(217,119,87,0.06)"
                : "var(--color-bg-elevated)",
              border: `1px solid ${msg.hit ? "var(--color-accent-border)" : "var(--color-border)"}`,
              opacity: visible ? 1 : 0,
              transform: `translateX(${visible ? 0 : -12}px)`,
              transition: "opacity 0.3s ease, transform 0.3s ease",
            }}
          >
            <div className="flex-1 text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
              {msg.text}
            </div>
            <div
              className="text-[10px] font-mono font-semibold shrink-0 tabular-nums"
              style={{ color: msg.hit ? "var(--color-accent)" : "var(--color-text-muted)" }}
            >
              {msg.sim.toFixed(2)}
            </div>
            {msg.hit && (
              <svg className="h-3 w-3 shrink-0" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompressVisual({ progress }: { progress: number }) {
  const tiers = [
    { label: "Old chats", mode: "Summary only", tokens: "~80", color: "var(--color-text-muted)", width: 25 },
    { label: "Recent", mode: "Last 10 msgs", tokens: "~800", color: "var(--color-text-secondary)", width: 55 },
    { label: "Now", mode: "Full thread", tokens: "Full", color: "var(--color-accent)", width: 100 },
  ];

  return (
    <div className="space-y-3 w-full max-w-[260px] sm:max-w-[300px]">
      {tiers.map((tier, i) => {
        const delay = i * 0.15;
        const visible = progress > delay;
        return (
          <div
            key={i}
            style={{
              opacity: visible ? 1 : 0,
              transform: `translateY(${visible ? 0 : 8}px)`,
              transition: "opacity 0.4s ease, transform 0.4s ease",
            }}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-medium" style={{ color: tier.color }}>
                {tier.label}
              </span>
              <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                {tier.tokens} tokens
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--color-bg-active)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: visible ? `${tier.width}%` : "0%",
                  background: tier.color === "var(--color-accent)"
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {tier.mode}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KnowledgeVisual({ progress }: { progress: number }) {
  const fields = [
    { key: "topics", value: "Tokyo dining" },
    { key: "facts", value: "5 nights · March" },
    { key: "decisions", value: "Staying in Shibuya" },
    { key: "open", value: "Which neighborhoods?" },
    { key: "prefs", value: "Loves sushi, no shellfish" },
  ];

  return (
    <div
      className="w-full max-w-[260px] sm:max-w-[300px] rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-mono font-semibold border-b"
        style={{
          background: "var(--color-bg-sidebar)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        thread.knowledge
      </div>
      <div className="px-3 py-2 space-y-1">
        {fields.map((f, i) => {
          const delay = i * 0.12;
          const visible = progress > delay;
          return (
            <div
              key={i}
              className="flex gap-2 text-[11px] font-mono"
              style={{
                opacity: visible ? 1 : 0,
                transform: `translateX(${visible ? 0 : 8}px)`,
                transition: "opacity 0.3s ease, transform 0.3s ease",
              }}
            >
              <span style={{ color: "var(--color-accent)" }}>{f.key}:</span>
              <span className="truncate" style={{ color: "var(--color-text-secondary)" }}>
                {f.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StreamVisual({ progress }: { progress: number }) {
  const words = "For Tokyo, mix high-end sushi in Ginza with casual ramen in Shinjuku. Skip shellfish spots…".split(" ");
  const wordCount = Math.floor(progress * words.length * 1.4);

  return (
    <div className="w-full max-w-[260px] sm:max-w-[300px] space-y-3">
      <div className="flex items-start gap-2">
        <div
          className="h-5 w-5 mt-0.5 shrink-0 rounded-full flex items-center justify-center"
          style={{ background: "var(--color-accent-subtle)" }}
        >
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-accent)" }} />
        </div>
        <div className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {words.slice(0, Math.min(wordCount, words.length)).join(" ")}
          {wordCount < words.length && (
            <span
              className="inline-block w-[2px] h-3 ml-0.5 align-middle"
              style={{ background: "var(--color-accent)", animation: "pulse 1s infinite" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StageVisual({ visual, progress }: { visual: Stage["visual"]; progress: number }) {
  switch (visual) {
    case "message": return <MessageVisual progress={progress} />;
    case "tree": return <TreeVisual progress={progress} />;
    case "embedding": return <EmbeddingVisual progress={progress} />;
    case "compress": return <CompressVisual progress={progress} />;
    case "knowledge": return <KnowledgeVisual progress={progress} />;
    case "stream": return <StreamVisual progress={progress} />;
  }
}

// ─── Pipeline rail (always-visible progress indicator) ──────────────

function PipelineRail({
  activeIndex,
  overallProgress,
}: {
  activeIndex: number;
  overallProgress: number;
}) {
  const fillPct = overallProgress * 100;

  return (
    <div className="relative w-full">
      <div className="absolute left-4 right-4 top-3 h-[2px] sm:top-3.5">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: "var(--color-border)" }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fillPct}%`,
            background: "var(--color-accent)",
            transition: "width 250ms linear",
          }}
        />
      </div>

      <ol className="relative flex justify-between">
        {STAGES.map((stage, i) => {
          const isActive = i === activeIndex;
          const isPassed = i < activeIndex;
          const lit = isActive || isPassed;
          return (
            <li key={stage.id} className="flex flex-col items-center min-w-0">
              <div
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full"
                style={{
                  background: lit ? "var(--color-accent)" : "var(--color-bg-elevated)",
                  border: `1.5px solid ${lit ? "var(--color-accent)" : "var(--color-border)"}`,
                  boxShadow: isActive ? "0 0 0 5px var(--color-accent-subtle)" : "none",
                  transition: "background 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
                }}
              >
                {stage.icon(lit)}
              </div>
              <span
                className="mt-1.5 text-[10px] sm:text-[11px] font-medium leading-none max-w-[60px] sm:max-w-[80px] text-center"
                style={{
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
              >
                {stage.shortLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

// Per-stage scroll height (in vh units). Smaller = snappier scroll.
const STAGE_VH = 50;

export function ArchitectureFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useScrollProgress(containerRef);

  const stageSlice = 1 / STAGES.length;
  const activeIndex = Math.min(
    STAGES.length - 1,
    Math.floor(scrollProgress * STAGES.length)
  );
  const stageLocalProgress =
    (scrollProgress - activeIndex * stageSlice) / stageSlice;

  return (
    <div ref={containerRef} style={{ height: `${STAGES.length * STAGE_VH}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="h-full flex items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-3xl">
            {/* Title + rail */}
            <h2
              className="text-center text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-5 sm:mb-7"
              style={{ color: "var(--color-text-primary)" }}
            >
              Follow a message through the pipeline
            </h2>
            <PipelineRail activeIndex={activeIndex} overallProgress={scrollProgress} />

            {/* Stage content — all stages render stacked via CSS grid so we
                can cross-fade between them as scroll crosses boundaries.
                The grid container sizes to the tallest child; each child
                occupies the same grid cell. */}
            <div className="mt-8 sm:mt-10 grid">
              {STAGES.map((s, i) => {
                const isActive = i === activeIndex;
                // Past stages stay at progress=1 (their visuals don't rewind
                // while fading out). Future stages stay at 0.
                const visualProgress =
                  i < activeIndex ? 1 : i > activeIndex ? 0 : stageLocalProgress;
                return (
                  <div
                    key={s.id}
                    className="col-start-1 row-start-1"
                    aria-hidden={!isActive}
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? "translateY(0)" : "translateY(6px)",
                      transition:
                        "opacity 500ms ease, transform 500ms cubic-bezier(0.22, 1, 0.36, 1)",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    <div className="flex flex-col md:flex-row items-center justify-center gap-5 md:gap-10">
                      <div className="md:w-2/5 shrink-0 text-center md:text-left">
                        <div className="flex items-baseline gap-2 justify-center md:justify-start mb-1.5">
                          <span
                            className="text-[11px] sm:text-xs font-mono font-semibold"
                            style={{ color: "var(--color-accent)" }}
                          >
                            {s.label}
                          </span>
                          <h3
                            className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {s.title}
                          </h3>
                        </div>
                        <p
                          className="text-sm sm:text-base mb-3"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {s.description}
                        </p>
                        <div
                          className="inline-block rounded-md px-2.5 py-1 text-[11px] sm:text-xs"
                          style={{
                            background: "var(--color-accent-subtle)",
                            border: "1px solid var(--color-accent-border)",
                            color: "var(--color-accent)",
                            fontWeight: 500,
                          }}
                        >
                          {s.detail}
                        </div>
                      </div>

                      <div className="flex-1 flex items-center justify-center min-h-[180px] sm:min-h-[220px] max-h-[40vh] overflow-hidden">
                        <StageVisual visual={s.visual} progress={visualProgress} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
