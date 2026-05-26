"use client";

import { TangentThread } from "./TangentThread";
import type { TangentWindowState } from "@/types";

interface TangentPanelProps {
  tangent: TangentWindowState;
  conversationId: string;
  /** ID of the message in this panel that spawned the next deeper tangent. */
  activeChildMessageId?: string;
  /** The highlighted text within the active-child message. */
  activeHighlightedText?: string;
  /** All sibling tangents (children of the same parent) — shown as tabs. */
  siblings?: TangentWindowState[];
  /** Called when the user clicks a sibling tab. */
  onSelectSibling?: (threadId: string) => void;
  onOpenTangent: (
    threadId: string,
    messageId: string,
    selectedText: string,
    rect: DOMRect
  ) => void;
  onMerge: (threadId: string) => void;
  onBranch: (threadId: string) => void;
  onClose: (threadId: string) => void;
}

export function TangentPanel({
  tangent,
  conversationId,
  activeChildMessageId,
  activeHighlightedText,
  siblings,
  onSelectSibling,
  onOpenTangent,
  onMerge,
  onBranch,
  onClose,
}: TangentPanelProps) {
  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: "1px solid var(--color-border)" }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{
          background: "var(--color-bg-base)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {/* Sibling tabs — shown when there are multiple children of the same parent */}
        {siblings && siblings.length > 1 && (
          <div className="flex gap-1 mb-2.5 overflow-x-auto pb-0.5">
            {siblings.map((s) => (
              <button
                key={s.threadId}
                onClick={() => onSelectSibling?.(s.threadId)}
                className="rounded px-2 py-0.5 text-xs font-medium flex-shrink-0 max-w-[140px] truncate transition-colors"
                style={{
                  background:
                    s.threadId === tangent.threadId
                      ? "var(--color-bg-active)"
                      : "var(--color-bg-elevated)",
                  color:
                    s.threadId === tangent.threadId
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                  border: `1px solid ${s.threadId === tangent.threadId ? "var(--color-border)" : "var(--color-border-subtle)"}`,
                }}
                title={s.highlightedText}
              >
                &ldquo;{s.highlightedText.slice(0, 20)}
                {s.highlightedText.length > 20 ? "…" : ""}&rdquo;
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2">
          {/* Indicator dot */}
          <div
            className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ background: "var(--color-text-muted)" }}
          />

          {/* Highlighted text */}
          <p
            className="flex-1 text-xs leading-relaxed break-words"
            style={{ color: "var(--color-text-secondary)" }}
          >
            &ldquo;{tangent.highlightedText}&rdquo;
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button
              type="button"
              onClick={() => onMerge(tangent.threadId)}
              className="btn-ghost btn-ghost--success rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              title="Merge back into parent thread"
            >
              Merge
            </button>

            <button
              type="button"
              onClick={() => onBranch(tangent.threadId)}
              className="btn-ghost btn-ghost--info rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              title="Branch into its own conversation"
            >
              Branch
            </button>

            <button
              type="button"
              onClick={() => onClose(tangent.threadId)}
              className="btn-icon-muted rounded-md p-1 transition-colors"
              aria-label="Close tangent"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Chat content */}
      <TangentThread
        threadId={tangent.threadId}
        parentThreadId={tangent.parentThreadId}
        conversationId={conversationId}
        activeChildMessageId={activeChildMessageId}
        activeHighlightedText={activeHighlightedText}
        onOpenTangent={onOpenTangent}
      />
    </div>
  );
}
