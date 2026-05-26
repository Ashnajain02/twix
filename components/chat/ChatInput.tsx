"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CodeInput } from "./CodeInput";

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  placeholder?: string;
  /** Required to enable the code-mode toggle (code execution is per-conversation). */
  conversationId?: string;
}

/**
 * Bottom-of-thread composer. Owns the input value and the chat-vs-code
 * mode toggle. Renders either a chat textarea or `<CodeInput>` depending
 * on mode — both share the same `input` value so switching is non-destructive.
 */
export function ChatInput({
  onSend,
  isLoading,
  placeholder,
  conversationId,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isCodeMode, setIsCodeMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // Autosize the textarea up to 180px.
  function handleAutosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  return (
    <div
      className="flex-shrink-0 py-4"
      style={{
        background: "var(--color-bg-base)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div className="mx-auto w-full max-w-2xl px-4">
        {isCodeMode && conversationId ? (
          <CodeInput
            value={input}
            onChange={setInput}
            onExit={() => setIsCodeMode(false)}
            conversationId={conversationId}
          />
        ) : (
          <form onSubmit={handleSubmit}>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              {conversationId && (
                <button
                  type="button"
                  onClick={() => setIsCodeMode(true)}
                  className={cn("code-mode-toggle")}
                  title="Switch to code"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 18l6-6-6-6M8 6l-6 6 6 6"
                    />
                  </svg>
                </button>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleAutosize();
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || "Message Twix…"}
                rows={1}
                className="flex-1 resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-gray-400"
                style={{
                  color: "var(--color-text-primary)",
                  maxHeight: "180px",
                }}
              />

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="btn-send flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all"
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 12h14M12 5l7 7-7 7"
                    />
                  </svg>
                )}
              </button>
            </div>

            <p
              className="mt-1.5 text-center text-[11px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Enter to send · Shift+Enter for new line
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
