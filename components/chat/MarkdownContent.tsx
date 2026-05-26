"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "./CodeBlock";

interface MarkdownContentProps {
  content: string;
  compact?: boolean;
  conversationId?: string;
}

/**
 * Shared markdown renderer used in every chat surface: main thread, tangent
 * panels, and the saved tangent history viewer. Supports GFM (tables,
 * strikethrough, etc.), math via KaTeX, and interactive Python code blocks.
 *
 * Previously wrapped in an error boundary that masked DOM-reconciliation
 * crashes from a sibling hook that mutated the DOM directly; that hook now
 * uses the CSS Custom Highlight API (see hooks/use-text-highlight.ts), so the
 * boundary is no longer load-bearing.
 */
export function MarkdownContent({
  content,
  compact,
  conversationId,
}: MarkdownContentProps) {
  return (
    <div className={compact ? "prose-twix-sm" : "prose-twix"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children }) {
            // Inline code (no language class) → render default.
            if (!className) {
              return <code className={className}>{children}</code>;
            }
            const match = /language-(\w+)/.exec(className);
            const language = match ? match[1] : "";
            const codeString = String(children).replace(/\n$/, "");
            return (
              <CodeBlock
                code={codeString}
                language={language}
                conversationId={conversationId ?? ""}
                compact={compact}
              />
            );
          },
          // Avoid double <pre> wrapping — CodeBlock renders its own.
          pre({ children }) {
            return <>{children}</>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
