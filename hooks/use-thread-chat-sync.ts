"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThreadChat } from "@/hooks/use-thread-chat";
import { useThreadMessages, type MessageRow } from "@/lib/api-hooks";

interface InitialMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Bridges the AI SDK's `useChat` (which owns live streaming state) with the
 * React Query cache for `/api/threads/[id]/messages` (the source of truth for
 * persisted DB state).
 *
 * The two need to stay in sync because:
 *   - Streaming responses live only in `useChat` until persisted
 *   - After a merge, message IDs in the DB are referenced by `MergeEvent`
 *     records and need to match client-side IDs so the inline merge indicator
 *     renders against the right anchor
 *
 * Sync rules:
 *   1. On mount, seed `useChat` from SSR-provided `initialMessages` (zero RTT).
 *   2. When the React Query cache updates (e.g. after a merge invalidates the
 *      threadMessages key), replace `useChat`'s messages with the fresh DB data.
 *   3. Never replace while a stream is in flight — that would clobber the
 *      partial assistant response. The effect waits for `status === "ready"`.
 */
export function useThreadChatSync(
  threadId: string,
  initialMessages?: InitialMessage[]
) {
  const { messages, setMessages, sendMessage, status } = useThreadChat(threadId);

  // SSR-provided initial messages, reshaped to the wire format React Query expects.
  const initialAsRows = useMemo<MessageRow[] | undefined>(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined;
    return initialMessages.map<MessageRow>((m) => ({
      id: m.id,
      threadId,
      role: m.role.toUpperCase() as MessageRow["role"],
      content: m.content,
      // Synthetic timestamp — `useChat`'s display doesn't depend on it.
      createdAt: new Date(0).toISOString(),
    }));
  }, [initialMessages, threadId]);

  // Capture "now" once via a useState lazy initializer. Passing this as
  // `initialDataUpdatedAt` tells React Query the seeded data is fresh, so
  // it does NOT refetch on mount. Refetches happen only on explicit
  // invalidation (e.g. after a merge). Re-mounting the hook resets it.
  const [seedUpdatedAt] = useState(() => Date.now());

  const messagesQuery = useThreadMessages(threadId, {
    initialData: initialAsRows,
    initialDataUpdatedAt: initialAsRows ? seedUpdatedAt : undefined,
  });

  // Sync DB messages → useChat. The ref tracks the last `dataUpdatedAt` we
  // applied, so we only re-sync on genuine cache updates (not on every render).
  const lastSyncedAtRef = useRef(0);
  useEffect(() => {
    const rows = messagesQuery.data;
    if (!rows) return;
    if (messagesQuery.dataUpdatedAt === lastSyncedAtRef.current) return;
    if (status === "streaming" || status === "submitted") return;

    setMessages(
      rows
        .filter((m) => m.role !== "SYSTEM")
        .map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "user" : "assistant",
          parts: [{ type: "text" as const, text: m.content }],
          createdAt: new Date(m.createdAt),
        }))
    );
    lastSyncedAtRef.current = messagesQuery.dataUpdatedAt;
  }, [messagesQuery.data, messagesQuery.dataUpdatedAt, status, setMessages]);

  // Flatten parts into a plain `content` string for display.
  const displayMessages = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content:
          m.parts
            ?.filter(
              (p): p is { type: "text"; text: string } => p.type === "text"
            )
            .map((p) => p.text)
            .join("") || "",
      })),
    [messages]
  );

  return {
    displayMessages,
    sendMessage,
    status,
    isLoading: status === "submitted" || status === "streaming",
  };
}
