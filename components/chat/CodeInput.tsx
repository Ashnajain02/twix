"use client";

import { useCallback, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import {
  CodeExecutionResult,
  type ExecutionResultData,
} from "./CodeExecutionResult";

interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  onExit: () => void;
  conversationId: string;
}

/**
 * Code-mode composer. Lives inside `ChatInput` and switches in when the
 * user clicks the "code" toggle. Owns its own execution state — input value
 * is hoisted so it survives mode switches.
 */
export function CodeInput({
  value,
  onChange,
  onExit,
  conversationId,
}: CodeInputProps) {
  const [result, setResult] = useState<ExecutionResultData | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback(async () => {
    if (isRunning || !value.trim()) return;
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({
          stdout: "",
          stderr: "",
          textResults: "",
          images: [],
          error: {
            name: "ExecutionError",
            message: data.error || `HTTP ${res.status}`,
            traceback: "",
          },
        });
      } else {
        setResult(data);
      }
    } catch {
      setResult({
        stdout: "",
        stderr: "",
        textResults: "",
        images: [],
        error: { name: "Error", message: "Execution failed", traceback: "" },
      });
    } finally {
      setIsRunning(false);
    }
  }, [conversationId, value, isRunning]);

  const handleExit = useCallback(() => {
    setResult(null);
    onExit();
  }, [onExit]);

  return (
    <div>
      <div
        className="overflow-hidden rounded-xl"
        style={{
          border: "1px solid var(--color-accent)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{
            background: "var(--color-code-toolbar)",
            color: "var(--color-code-muted)",
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExit}
              className="rounded p-1 transition-colors hover:text-white"
              title="Switch to chat"
            >
              <svg
                className="h-3.5 w-3.5"
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
            <span className="text-xs font-medium">Python</span>
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || !value.trim()}
            className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--color-success)" }}
          >
            {isRunning ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {isRunning ? "Running" : "Run"}
          </button>
        </div>

        <CodeEditor
          value={value}
          onChange={onChange}
          language="python"
          minHeight="100px"
          maxHeight="300px"
          onRun={handleRun}
          autoFocus
        />

        {result && (
          <div style={{ borderTop: "1px solid var(--color-code-toolbar)" }}>
            <CodeExecutionResult result={result} />
          </div>
        )}
      </div>

      <p
        className="mt-1.5 text-center text-[11px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Cmd+Enter to run
      </p>
    </div>
  );
}
