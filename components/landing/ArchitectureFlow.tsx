"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Follow the Message" — a scroll-driven architecture walkthrough.
 *
 * As the user scrolls, they follow a user message through the entire
 * Twix pipeline: auth → context building → pgvector search →
 * knowledge distillation → streaming response.
 *
 * Each stage reveals with a left visualization + right explanation.
 */

// ─── Stage definitions ──────────────────────────────────────────────

interface Stage {
  id: string;
  label: string;
  title: string;
  description: string;
  detail: string;
  visual: "message" | "tree" | "embedding" | "knowledge" | "compress" | "stream";
}

const STAGES: Stage[] = [
  {
    id: "message",
    label: "01",
    title: "Message arrives",
    description: "User sends a message from a tangent thread 3 levels deep.",
    detail: '"How do we handle RSA key rotation?"',
    visual: "message",
  },
  {
    id: "tree",
    label: "02",
    title: "Ancestor chain resolved",
    description:
      "A single recursive CTE fetches the entire ancestor thread chain in one database round-trip.",
    detail: "Main → Tangent A → Sub-tangent B → Current thread",
    visual: "tree",
  },
  {
    id: "embedding",
    label: "03",
    title: "Semantic retrieval",
    description:
      "The query is embedded via text-embedding-3-small and compared against all ancestor messages using pgvector cosine similarity with an HNSW index.",
    detail: "Top 6 most relevant messages cherry-picked from any ancestor",
    visual: "embedding",
  },
  {
    id: "compress",
    label: "04",
    title: "Hierarchical compression",
    description:
      "Distant ancestors are reduced to structured knowledge. The immediate parent keeps its last 10 messages verbatim. The current thread stays in full.",
    detail: "~200 tokens for ancestors instead of 5,000+",
    visual: "compress",
  },
  {
    id: "knowledge",
    label: "05",
    title: "Structured knowledge",
    description:
      "Instead of lossy paragraph summaries, conversations are distilled into typed JSON — facts, decisions, open questions, user preferences, and entities.",
    detail: "Queryable, mergeable, contradiction-detectable",
    visual: "knowledge",
  },
  {
    id: "stream",
    label: "06",
    title: "Response streams",
    description:
      "The AI receives a precise, compact context window and begins streaming. Embedding + knowledge generation fire in the background for the next turn.",
    detail: "First token in ~100ms at any branch depth",
    visual: "stream",
  },
];

// ─── Visual components for each stage ───────────────────────────────

function MessageVisual({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* User message bubble */}
      <div
        className="rounded-2xl px-5 py-3 text-sm max-w-[280px]"
        style={{
          background: "var(--color-bg-user-msg)",
          border: "1px solid var(--color-border-subtle)",
          color: "var(--color-text-primary)",
          opacity: Math.min(1, progress * 3),
          transform: `translateY(${(1 - Math.min(1, progress * 3)) * 12}px)`,
        }}
      >
        How do we handle RSA key rotation?
      </div>
      {/* Arrow down */}
      <svg
        width="24" height="32" viewBox="0 0 24 32"
        style={{
          opacity: Math.min(1, Math.max(0, (progress - 0.3) * 4)),
          color: "var(--color-accent)",
        }}
      >
        <path d="M12 0v24M6 18l6 8 6-8" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* API badge */}
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
    { label: "Main", depth: 0, x: 50, y: 16 },
    { label: "Tangent A", depth: 1, x: 50, y: 44 },
    { label: "Sub-tangent B", depth: 2, x: 50, y: 72 },
    { label: "Current", depth: 3, x: 50, y: 100, active: true },
  ];
  const revealCount = Math.floor(progress * (nodes.length + 1));

  return (
    <svg viewBox="0 0 100 116" className="w-full max-w-[260px]" style={{ overflow: "visible" }}>
      {/* Connecting lines */}
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
      {/* Nodes */}
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
            <text
              x={node.x - 14}
              y={node.y + 3}
              fontSize="5.5"
              fill="var(--color-text-muted)"
              textAnchor="end"
              fontFamily="inherit"
            >
              depth {node.depth}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmbeddingVisual({ progress }: { progress: number }) {
  const messages = [
    { text: "RSA uses two large primes", sim: 0.89, hit: true },
    { text: "Key generation process...", sim: 0.85, hit: true },
    { text: "Bubble sort comparison", sim: 0.23, hit: false },
    { text: "Public key distribution", sim: 0.82, hit: true },
    { text: "Certificate authorities", sim: 0.79, hit: true },
    { text: "Array indexing basics", sim: 0.18, hit: false },
  ];

  return (
    <div className="space-y-1.5 w-full max-w-[280px]">
      {messages.map((msg, i) => {
        const delay = i * 0.12;
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
              transition: "opacity 0.4s ease, transform 0.4s ease",
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
    { label: "Grandparent", mode: "Knowledge only", tokens: "~80", color: "var(--color-text-muted)", width: 25 },
    { label: "Parent", mode: "Knowledge + 10 msgs", tokens: "~800", color: "var(--color-text-secondary)", width: 55 },
    { label: "Current", mode: "Full messages", tokens: "Full", color: "var(--color-accent)", width: 100 },
  ];

  return (
    <div className="space-y-3 w-full max-w-[280px]">
      {tiers.map((tier, i) => {
        const delay = i * 0.2;
        const visible = progress > delay;
        return (
          <div
            key={i}
            style={{
              opacity: visible ? 1 : 0,
              transform: `translateY(${visible ? 0 : 8}px)`,
              transition: "opacity 0.5s ease, transform 0.5s ease",
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
                  transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
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
    { key: "topics", value: "RSA encryption, key management" },
    { key: "facts", value: "RSA uses primes p,q | n = p×q" },
    { key: "decisions", value: "Use 2048-bit keys" },
    { key: "open", value: "Key rotation strategy?" },
    { key: "prefs", value: "Wants code examples" },
  ];

  return (
    <div
      className="w-full max-w-[280px] rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      {/* JSON header */}
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
          const delay = i * 0.15;
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
  const words = "RSA key rotation involves periodically generating new key pairs and re-encrypting existing data. The standard approach uses a key versioning scheme where...".split(" ");
  const wordCount = Math.floor(progress * words.length * 1.2);

  return (
    <div className="w-full max-w-[280px] space-y-3">
      {/* Streaming response */}
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
      {/* Background tasks */}
      {progress > 0.5 && (
        <div
          className="flex flex-wrap gap-1.5"
          style={{
            opacity: Math.min(1, (progress - 0.5) * 3),
          }}
        >
          {["embed msg", "update knowledge", "auto-title"].map((task) => (
            <span
              key={task}
              className="rounded-full px-2 py-0.5 text-[9px] font-medium"
              style={{
                background: "rgba(34,197,94,0.08)",
                color: "var(--color-success, #16A34A)",
                border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              {task}
            </span>
          ))}
        </div>
      )}
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

// ─── Main component ─────────────────────────────────────────────────

export function ArchitectureFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      setScrollProgress(Math.max(0, Math.min(1, -rect.top / total)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Each stage gets an equal slice of the scroll range
  const stageSlice = 1 / STAGES.length;

  return (
    <div ref={containerRef} style={{ height: `${STAGES.length * 100}vh` }}>
      <div className="sticky top-0" style={{ height: "100vh" }}>
        <div className="h-full flex flex-col justify-center">
          <div className="mx-auto max-w-5xl w-full px-6">

            {/* Section header */}
            <div className="text-center mb-10 md:mb-14">
              <p
                className="text-sm font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--color-accent)" }}
              >
                Under the Hood
              </p>
              <h2
                className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
                style={{ color: "var(--color-text-primary)" }}
              >
                Follow a message through the pipeline
              </h2>
              <p
                className="mt-3 text-sm sm:text-base max-w-lg mx-auto"
                style={{ color: "var(--color-text-secondary)" }}
              >
                From user input to streamed response — every stage optimized
                for speed and accuracy.
              </p>
            </div>

            {/* Stage content — left visual, right text */}
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
              {/* Left: visual */}
              <div
                className="relative flex-1 flex items-center justify-center"
                style={{ minHeight: 280 }}
              >
                {STAGES.map((stage, i) => {
                  const stageStart = i * stageSlice;
                  const stageEnd = (i + 1) * stageSlice;
                  const isActive =
                    scrollProgress >= stageStart && scrollProgress < stageEnd;
                  const stageProgress = isActive
                    ? (scrollProgress - stageStart) / stageSlice
                    : scrollProgress >= stageEnd
                    ? 1
                    : 0;

                  return (
                    <div
                      key={stage.id}
                      className="absolute flex items-center justify-center"
                      style={{
                        opacity: isActive ? 1 : 0,
                        transform: isActive
                          ? "translateY(0) scale(1)"
                          : scrollProgress < stageStart
                          ? "translateY(20px) scale(0.97)"
                          : "translateY(-20px) scale(0.97)",
                        transition: "opacity 0.5s ease, transform 0.5s ease",
                        pointerEvents: isActive ? "auto" : "none",
                      }}
                    >
                      <StageVisual
                        visual={stage.visual}
                        progress={stageProgress}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Right: text */}
              <div className="relative flex-1" style={{ minHeight: 260 }}>
                {STAGES.map((stage, i) => {
                  const stageStart = i * stageSlice;
                  const stageEnd = (i + 1) * stageSlice;
                  const isActive =
                    scrollProgress >= stageStart && scrollProgress < stageEnd;

                  return (
                    <div
                      key={stage.id}
                      className="absolute max-w-md"
                      style={{
                        opacity: isActive ? 1 : 0,
                        transform: isActive
                          ? "translateY(0)"
                          : scrollProgress < stageStart
                          ? "translateY(24px)"
                          : "translateY(-24px)",
                        transition: "opacity 0.5s ease, transform 0.5s ease",
                        pointerEvents: isActive ? "auto" : "none",
                      }}
                    >
                      {/* Step number */}
                      <div
                        className="text-xs font-mono font-semibold mb-2"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {stage.label}
                      </div>

                      {/* Title */}
                      <h3
                        className="text-xl font-bold tracking-tight sm:text-2xl mb-3"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {stage.title}
                      </h3>

                      {/* Description */}
                      <p
                        className="text-sm sm:text-base leading-relaxed mb-4"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {stage.description}
                      </p>

                      {/* Detail callout */}
                      <div
                        className="rounded-lg px-4 py-2.5 text-xs sm:text-sm"
                        style={{
                          background: "var(--color-accent-subtle)",
                          border: "1px solid var(--color-accent-border)",
                          color: "var(--color-accent)",
                          fontWeight: 500,
                        }}
                      >
                        {stage.detail}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mt-10 md:mt-14">
              {STAGES.map((stage, i) => {
                const stageStart = i * stageSlice;
                const stageEnd = (i + 1) * stageSlice;
                const isActive =
                  scrollProgress >= stageStart && scrollProgress < stageEnd;
                const isPast = scrollProgress >= stageEnd;

                return (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: isActive ? 24 : 8,
                        height: 8,
                        background: isActive
                          ? "var(--color-accent)"
                          : isPast
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                        opacity: isPast ? 0.4 : 1,
                      }}
                    />
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
