"use client";

import { useCallback, useEffect, useMemo } from "react";
import { MainThread } from "./MainThread";
import { TangentPanel } from "./TangentPanel";
import { useTangentStore } from "@/store/tangent-store";
import { useConversationTangents } from "@/lib/api-hooks";
import { useTangentActions } from "@/hooks/use-tangent-actions";
import type { TangentWindowState } from "@/types";

interface ChatPageProps {
  conversationId: string;
  mainThreadId: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  initialTangents?: TangentWindowState[];
}

export function ChatPage({
  conversationId,
  mainThreadId,
  initialMessages,
  initialTangents,
}: ChatPageProps) {
  // ─── Tangent store (UI state) ─────────────────────────────────────
  const openTangents = useTangentStore((s) => s.openTangents);
  const activeChildByParent = useTangentStore((s) => s.activeChildByParent);
  const viewParentId = useTangentStore((s) => s.viewParentId);
  const storeConversationId = useTangentStore((s) => s.conversationId);
  const hydrate = useTangentStore((s) => s.hydrate);
  const navigateTo = useTangentStore((s) => s.navigateTo);
  const setActiveChild = useTangentStore((s) => s.setActiveChild);

  // ─── Server-side tangent data ─────────────────────────────────────
  // SSR-provided `initialTangents` gives us a fast first render; the React
  // Query fetch then ensures we surface any tangents created after the
  // server payload was cached (Next.js Router Cache can serve stale RSC).
  const tangentsQuery = useConversationTangents(conversationId);

  // On mount / conversation switch — hydrate the store from server-provided
  // initial data, then again whenever the server data drifts from the store.
  useEffect(() => {
    if (storeConversationId !== conversationId) {
      hydrate(conversationId, initialTangents ?? []);
    }
  }, [conversationId, storeConversationId, initialTangents, hydrate]);

  useEffect(() => {
    const fresh = tangentsQuery.data;
    if (!fresh) return;
    // Re-hydrate only when the server knows about tangents the store doesn't
    // (e.g. stale RSC payload, another tab opened a tangent). NEVER when the
    // store has more than the server — that's the optimistic-update window
    // for `openTangentLocal`, and overwriting it would wipe the just-created
    // tangent before useCreateTangent's onSuccess populates the cache.
    const storeIds = new Set(openTangents.map((t) => t.threadId));
    const serverHasNew = fresh.some((t) => !storeIds.has(t.threadId));
    if (serverHasNew) {
      hydrate(conversationId, fresh);
    }
  }, [tangentsQuery.data, conversationId, openTangents, hydrate]);

  // ─── Actions ──────────────────────────────────────────────────────
  const actions = useTangentActions(conversationId, mainThreadId);

  // Adapter: the text-selection menu hands us a DOMRect we don't use here.
  const handleOpenTangent = useCallback(
    (threadId: string, messageId: string, selectedText: string, _rect: DOMRect) => {
      actions.openTangent(threadId, messageId, selectedText);
    },
    [actions]
  );

  // ─── Derived state (all memoized) ─────────────────────────────────
  const tangentMap = useMemo(
    () => new Map(openTangents.map((t) => [t.threadId, t])),
    [openTangents]
  );

  const rightTangent = useMemo(() => {
    const id = activeChildByParent[viewParentId];
    return id ? tangentMap.get(id) : undefined;
  }, [activeChildByParent, viewParentId, tangentMap]);

  const rightSiblings = useMemo(
    () => openTangents.filter((t) => t.parentThreadId === viewParentId),
    [openTangents, viewParentId]
  );

  const mainActiveChildTangent = useMemo(
    () => tangentMap.get(activeChildByParent["main"] ?? ""),
    [tangentMap, activeChildByParent]
  );

  const leftActiveChildMessageId = rightTangent?.parentMessageId;
  const leftActiveChildHighlightedText = rightTangent?.highlightedText;
  const mainActiveChildMessageId = mainActiveChildTangent?.parentMessageId;
  const mainActiveChildHighlightedText = mainActiveChildTangent?.highlightedText;

  // Breadcrumb: walk UP from viewParentId → main, then DOWN the active-child
  // chain, so deeply-nested tangents stay reachable after the user "zooms out".
  const breadcrumbPath = useMemo(() => {
    const pathIds: string[] = [];

    let cur = viewParentId;
    const upVisited = new Set<string>();
    while (cur !== "main" && !upVisited.has(cur)) {
      upVisited.add(cur);
      if (!tangentMap.has(cur)) break;
      pathIds.unshift(cur);
      cur = tangentMap.get(cur)?.parentThreadId ?? "main";
    }
    pathIds.unshift("main");

    let deepCur = activeChildByParent[pathIds[pathIds.length - 1]];
    const downVisited = new Set<string>(upVisited);
    while (deepCur && tangentMap.has(deepCur) && !downVisited.has(deepCur)) {
      downVisited.add(deepCur);
      pathIds.push(deepCur);
      deepCur = activeChildByParent[deepCur];
    }

    return pathIds.map((id, idx) => {
      const parentId = idx === 0 ? null : pathIds[idx - 1];
      const tangent = tangentMap.get(id);
      const label =
        id === "main"
          ? "Main"
          : `"${tangent!.highlightedText.slice(0, 24)}${
              tangent!.highlightedText.length > 24 ? "…" : ""
            }"`;
      return { id, parentId, label };
    });
  }, [viewParentId, activeChildByParent, tangentMap]);

  const handleBreadcrumbClick = useCallback(
    (item: { id: string; parentId: string | null }) => {
      if (item.id === "main") {
        navigateTo("main");
        return;
      }
      // If this tangent has an active child, zoom in so it becomes the left
      // panel. Otherwise it's already visible as the right panel — no-op.
      const childId = activeChildByParent[item.id];
      if (childId && tangentMap.has(childId)) navigateTo(item.id);
    },
    [navigateTo, activeChildByParent, tangentMap]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb — only when tangents are open */}
      {openTangents.length > 0 && (
        <div
          className="flex-shrink-0 flex items-center gap-1 px-4 py-2 overflow-x-auto"
          style={{
            background: "var(--color-bg-base)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          {breadcrumbPath.map((item, idx) => {
            const isActive =
              item.id === viewParentId ||
              (item.id === "main" && viewParentId === "main");
            return (
              <div key={item.id} className="flex items-center gap-1 flex-shrink-0">
                {idx > 0 && (
                  <svg
                    className="h-3 w-3 flex-shrink-0"
                    style={{ color: "var(--color-text-secondary)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
                <button
                  onClick={() => handleBreadcrumbClick(item)}
                  className="rounded px-1.5 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? "var(--color-accent-subtle)" : "transparent",
                  }}
                >
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel area. All panels mount once; visibility toggles via display.
          Keeps `useChat` state alive when a panel shifts out of view. */}
      <div className="flex flex-1 min-h-0">
        <div
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "column",
            height: "100%",
            display: viewParentId === "main" ? "flex" : "none",
          }}
        >
          <MainThread
            threadId={mainThreadId}
            conversationId={conversationId}
            activeChildMessageId={mainActiveChildMessageId}
            activeHighlightedText={mainActiveChildHighlightedText}
            onOpenTangent={handleOpenTangent}
            initialMessages={initialMessages}
          />
        </div>

        {/* Only mount the two visible tangent panels (left + right). */}
        {openTangents
          .filter((tangent) => {
            const isLeft = tangent.threadId === viewParentId;
            const isRight = tangent.threadId === rightTangent?.threadId;
            return isLeft || isRight;
          })
          .map((tangent) => {
            const isLeft = tangent.threadId === viewParentId;
            return (
              <div
                key={tangent.threadId}
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "column",
                  height: "100%",
                  display: "flex",
                }}
              >
                <TangentPanel
                  tangent={tangent}
                  conversationId={conversationId}
                  activeChildMessageId={isLeft ? leftActiveChildMessageId : undefined}
                  activeHighlightedText={isLeft ? leftActiveChildHighlightedText : undefined}
                  siblings={!isLeft ? rightSiblings : undefined}
                  onSelectSibling={
                    !isLeft ? (id) => setActiveChild(viewParentId, id) : undefined
                  }
                  onOpenTangent={handleOpenTangent}
                  onMerge={actions.mergeTangent}
                  onBranch={actions.branchTangent}
                  onClose={actions.closeTangent}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
