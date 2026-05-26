"use client";

import { useEffect, useId } from "react";

/**
 * Highlight an arbitrary substring of text inside a container.
 *
 * Uses the CSS Custom Highlight API — no DOM mutation, so React's reconciler
 * never sees stray highlight nodes. This replaces an earlier implementation
 * that called `parent.replaceChild()` directly into a React-owned subtree,
 * which produced sporadic "insertBefore" / "removeChild" errors that were
 * being silently swallowed by a Markdown error boundary.
 *
 * In browsers without the API (older Firefox), the highlight simply does
 * not render. Selection + tangent-spawn still work — only the visual cue is
 * absent. See `app/globals.css` for the `::highlight(tangent-highlight)` rule.
 */

const HIGHLIGHT_NAME = "tangent-highlight";

// Registry keyed by useId so multiple visible bubbles can highlight at once.
const ranges = new Map<string, Range>();

let stylesInstalled = false;

/**
 * Inject the `::highlight()` CSS rule on first use. We can't put this in
 * `app/globals.css` because some CSS toolchains (Lightning CSS bundled with
 * Tailwind v4) don't yet parse the pseudo-element and reject the file.
 * Browser CSS engines do recognize it — they just need the rule to exist.
 */
function installStyles() {
  if (stylesInstalled || typeof document === "undefined") return;
  stylesInstalled = true;
  const style = document.createElement("style");
  style.dataset.tangentHighlight = "true";
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) {
      background-color: var(--color-accent-subtle);
      text-decoration: underline solid var(--color-accent-border) 1.5px;
      text-underline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.Highlight === "function" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS
  );
}

function publishRegistry() {
  if (!isSupported()) return;
  if (ranges.size === 0) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
    return;
  }
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges.values()));
}

/**
 * Build a `Range` covering the first occurrence of `text` inside `container`.
 * Walks all text nodes so the range can span across element boundaries (e.g.
 * highlighting through `<em>`, `<code>`, or `<a>` children of a paragraph).
 *
 * Returns null if the text cannot be located; callers should treat this as
 * "skip highlight" rather than an error.
 */
function buildRangeForText(container: Element, text: string): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let cur: Node | null;
  while ((cur = walker.nextNode())) nodes.push(cur as Text);
  if (nodes.length === 0) return null;

  let full = "";
  const startOffsets: number[] = [];
  for (const n of nodes) {
    startOffsets.push(full.length);
    full += n.textContent ?? "";
  }

  // Exact match preferred; fall back to case-insensitive.
  let matchIdx = full.indexOf(text);
  if (matchIdx === -1) {
    matchIdx = full.toLowerCase().indexOf(text.toLowerCase());
  }
  if (matchIdx === -1) return null;

  const matchEnd = matchIdx + text.length;

  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (let i = 0; i < nodes.length; i++) {
    const nodeStart = startOffsets[i];
    const nodeEnd = nodeStart + (nodes[i].textContent?.length ?? 0);

    if (startNode === null && matchIdx >= nodeStart && matchIdx < nodeEnd) {
      startNode = nodes[i];
      startOffset = matchIdx - nodeStart;
    }
    if (matchEnd > nodeStart && matchEnd <= nodeEnd) {
      endNode = nodes[i];
      endOffset = matchEnd - nodeStart;
      break;
    }
  }

  if (!startNode || !endNode) return null;

  const range = new Range();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function useTextHighlight(
  ref: React.RefObject<HTMLElement | null>,
  highlightedText: string | undefined,
  contentVersion?: string
) {
  const id = useId();

  useEffect(() => {
    if (!isSupported()) return;
    installStyles();

    // Defer one frame so React has finished the current commit and the DOM
    // we're about to walk is the freshly-rendered one.
    let raf = 0;
    const apply = () => {
      const container = ref.current;
      if (!container || !highlightedText) {
        ranges.delete(id);
        publishRegistry();
        return;
      }
      const range = buildRangeForText(container, highlightedText);
      if (range) {
        ranges.set(id, range);
      } else {
        ranges.delete(id);
      }
      publishRegistry();
    };

    raf = requestAnimationFrame(apply);

    return () => {
      cancelAnimationFrame(raf);
      ranges.delete(id);
      publishRegistry();
    };
  }, [id, ref, highlightedText, contentVersion]);
}
