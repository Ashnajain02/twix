"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { MergeEvent, TangentWindowState } from "@/types";
import { reconstructTangentState } from "@/lib/tangent-utils";

/**
 * React Query data layer for the chat surface.
 *
 * One file holds query keys, fetch helpers, read hooks (useX), and mutation
 * hooks (useXMutation). Keeping them together makes it easy to keep the
 * invalidation graph honest — every mutation can see the keys it must
 * invalidate.
 */

// ─── Query keys ─────────────────────────────────────────────────────

export const qk = {
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversations", id] as const,
  thread: (threadId: string) => ["threads", threadId] as const,
  threadMessages: (threadId: string) =>
    ["threads", threadId, "messages"] as const,
} as const;

// ─── HTTP helper ────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Body wasn't JSON — fall back to statusText.
    }
    throw new HttpError(res.status, message);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ─── Wire types ─────────────────────────────────────────────────────
// Wire shape (dates become strings after JSON serialization).

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface ThreadRow {
  id: string;
  conversationId: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  highlightedText: string | null;
  status: "ACTIVE" | "MERGED" | "ARCHIVED";
  depth: number;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  threads: ThreadRow[];
}

export interface MessageRow {
  id: string;
  threadId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

export interface ThreadWithMerges {
  id: string;
  mergesAsTarget: MergeEvent[];
}

// ─── Read hooks ─────────────────────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => http<ConversationListItem[]>("/api/conversations"),
  });
}

/**
 * The conversation detail fetch is used by ChatPage to derive the open
 * tangent set on mount. We reshape the response (threads → TangentWindowState[])
 * via `select` so consumers can subscribe to just what they need.
 */
export function useConversationTangents(conversationId: string) {
  return useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: () =>
      http<ConversationDetail>(`/api/conversations/${conversationId}`),
    select: (data): TangentWindowState[] => {
      const main = data.threads.find((t) => !t.parentThreadId);
      if (!main) return [];
      return reconstructTangentState(data.threads, main.id);
    },
  });
}

/**
 * Merge events landing on the given thread. Inserting a merge event into
 * the cache (rather than refetching) is the responsibility of the merge
 * mutation; this hook just reads.
 */
export function useThreadMergeEvents(
  threadId: string,
  options?: Pick<UseQueryOptions<ThreadWithMerges, HttpError, MergeEvent[]>, "enabled">
) {
  return useQuery({
    queryKey: qk.thread(threadId),
    queryFn: () => http<ThreadWithMerges>(`/api/threads/${threadId}`),
    select: (data) => data.mergesAsTarget,
    enabled: options?.enabled,
  });
}

/**
 * Messages for a thread. Used by both MainThread and TangentThread to
 * hydrate the AI SDK's local `useChat` state from the DB on mount and
 * whenever a merge event lands.
 *
 * Callers can pass `initialData` (SSR-provided messages) plus
 * `initialDataUpdatedAt: Date.now()` to skip the initial fetch.
 */
type ThreadMessagesOptions = Partial<
  Pick<
    UseQueryOptions<MessageRow[], HttpError>,
    "enabled" | "initialData" | "initialDataUpdatedAt"
  >
>;

export function useThreadMessages(
  threadId: string,
  options?: ThreadMessagesOptions
) {
  return useQuery({
    queryKey: qk.threadMessages(threadId),
    queryFn: () => http<MessageRow[]>(`/api/threads/${threadId}/messages`),
    ...options,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────

export function useCreateTangent(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentThreadId: string; highlightedText: string }) =>
      http<ThreadRow>(
        `/api/conversations/${conversationId}/threads`,
        json(input)
      ),
    onSuccess: (newThread) => {
      // Append the new thread to the cached conversation detail so the
      // ChatPage rehydrate effect sees matching IDs between store and cache
      // and doesn't clobber the optimistic store update.
      queryClient.setQueryData<ConversationDetail | undefined>(
        qk.conversation(conversationId),
        (prev) =>
          prev
            ? { ...prev, threads: [...prev.threads, newThread] }
            : prev
      );
    },
  });
}

/**
 * Walk the conversation tree to collect the descendants of a root thread
 * (BFS, dedup'd). Used to mirror the server's cascade on the client cache
 * so optimistic updates match reality before the round-trip completes.
 *
 * Pass `activeOnly: true` for archive/merge (which only cascade over ACTIVE
 * descendants); pass `activeOnly: false` for delete (total wipe regardless
 * of status).
 */
function collectDescendantsInCache(
  threads: ThreadRow[],
  rootThreadId: string,
  options: { activeOnly: boolean }
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const t of threads) {
    if (!t.parentThreadId) continue;
    if (options.activeOnly && t.status !== "ACTIVE") continue;
    const list = childrenByParent.get(t.parentThreadId);
    if (list) list.push(t.id);
    else childrenByParent.set(t.parentThreadId, [t.id]);
  }
  const descendants: string[] = [];
  const visited = new Set<string>([rootThreadId]);
  const queue: string[] = [rootThreadId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const childId of childrenByParent.get(cur) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendants.push(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

/**
 * Apply a status change to one or more threads in the cached conversation
 * detail. Mirrors the server-side update so `useConversationTangents`
 * (which filters by `status === "ACTIVE"`) immediately reflects the change
 * — preventing ChatPage's rehydrate effect from racing the local store.
 */
function setThreadStatusInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  updates: Map<string, ThreadRow["status"]>
) {
  queryClient.setQueryData<ConversationDetail | undefined>(
    qk.conversation(conversationId),
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        threads: prev.threads.map((t) =>
          updates.has(t.id) ? { ...t, status: updates.get(t.id)! } : t
        ),
      };
    }
  );
}

export function useMergeTangent(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      http<MergeEvent>(`/api/threads/${threadId}/merge`, { method: "POST" }),
    onMutate: (threadId) => {
      // Optimistic: mark source MERGED + active descendants ARCHIVED.
      // Mirrors the server's cascade in lib/thread-tree.ts so the cache
      // matches reality before the network call returns.
      const cached = queryClient.getQueryData<ConversationDetail>(
        qk.conversation(conversationId)
      );
      const descendants = cached
        ? collectDescendantsInCache(cached.threads, threadId, { activeOnly: true })
        : [];
      const updates = new Map<string, ThreadRow["status"]>([
        [threadId, "MERGED"],
        ...descendants.map(
          (id) => [id, "ARCHIVED"] as [string, ThreadRow["status"]]
        ),
      ]);
      setThreadStatusInCache(queryClient, conversationId, updates);
    },
    onSuccess: (mergeEvent) => {
      // Insert the new merge event into the target thread's cache without
      // refetching. The target is `mergeEvent.targetThreadId`.
      queryClient.setQueryData<ThreadWithMerges | undefined>(
        qk.thread(mergeEvent.targetThreadId),
        (prev) =>
          prev
            ? { ...prev, mergesAsTarget: [...prev.mergesAsTarget, mergeEvent] }
            : prev
      );
      // The target thread's message IDs are referenced by mergeEvent.afterMessageId —
      // re-fetch messages so client IDs match DB IDs for the inline merge indicator.
      queryClient.invalidateQueries({
        queryKey: qk.threadMessages(mergeEvent.targetThreadId),
      });
    },
  });
}

export function useBranchTangent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      http<{ conversation: ConversationListItem }>(
        `/api/threads/${threadId}/branch`,
        { method: "POST" }
      ),
    onSuccess: ({ conversation }) => {
      // Optimistically prepend to the conversation list cache so the new
      // conversation appears in the sidebar instantly.
      queryClient.setQueryData<ConversationListItem[] | undefined>(
        qk.conversations,
        (prev) => (prev ? [conversation, ...prev] : prev)
      );
    },
  });
}

/**
 * Hard-delete this thread + all its descendants. Used by Close (X) and as
 * the post-branch cleanup. The cache update removes them from the threads
 * array entirely (vs the soft archive which marks status). Merge does NOT
 * use this — it keeps the source as MERGED so the inline merge indicator
 * in the parent thread stays functional.
 */
export function useDeleteThread(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      http<void>(`/api/threads/${threadId}`, { method: "DELETE" }),
    onMutate: (threadId) => {
      const cached = queryClient.getQueryData<ConversationDetail>(
        qk.conversation(conversationId)
      );
      if (!cached) return;
      // Total cascade — server deletes everything under the subtree regardless
      // of status, so mirror that here.
      const descendants = collectDescendantsInCache(cached.threads, threadId, {
        activeOnly: false,
      });
      const idsToRemove = new Set([threadId, ...descendants]);
      queryClient.setQueryData<ConversationDetail>(
        qk.conversation(conversationId),
        {
          ...cached,
          threads: cached.threads.filter((t) => !idsToRemove.has(t.id)),
        }
      );
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string }) =>
      http<{ conversation: ConversationListItem; mainThread: ThreadRow }>(
        "/api/conversations",
        json(input)
      ),
    onSuccess: ({ conversation }) => {
      queryClient.setQueryData<ConversationListItem[] | undefined>(
        qk.conversations,
        (prev) => (prev ? [conversation, ...prev] : [conversation])
      );
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      http<void>(`/api/conversations/${conversationId}`, { method: "DELETE" }),
    onSuccess: (_void, conversationId) => {
      queryClient.setQueryData<ConversationListItem[] | undefined>(
        qk.conversations,
        (prev) => prev?.filter((c) => c.id !== conversationId)
      );
      queryClient.removeQueries({ queryKey: qk.conversation(conversationId) });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      http<ConversationListItem>(
        `/api/conversations/${id}`,
        { ...json({ title }), method: "PATCH" }
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<ConversationListItem[] | undefined>(
        qk.conversations,
        (prev) =>
          prev?.map((c) => (c.id === updated.id ? { ...c, title: updated.title } : c))
      );
    },
  });
}

/** Invalidate the conversation list — used after auto-title from the chat stream. */
export function useInvalidateConversations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: qk.conversations });
}

export { HttpError };
