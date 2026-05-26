"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTangentStore } from "@/store/tangent-store";
import {
  useBranchTangent,
  useCreateTangent,
  useDeleteThread,
  useMergeTangent,
} from "@/lib/api-hooks";

/**
 * The four user-driven tangent operations, packaged with their server-side
 * mutations and the local tangent-store updates that have to happen alongside.
 *
 * Behavior summary:
 *   open    — create a new tangent thread, append to store
 *   merge   — mark source MERGED (soft) so the inline merge indicator in the
 *             parent keeps a working reference; cascade-archive descendants
 *   branch  — copy this thread into a new conversation, then HARD DELETE the
 *             source (and its descendants) since the user moved on
 *   close   — HARD DELETE the tangent + descendants (user explicitly discarded)
 */
export function useTangentActions(
  conversationId: string,
  mainThreadId: string
) {
  const router = useRouter();
  const openTangentLocal = useTangentStore((s) => s.openTangent);
  const closeTangentLocal = useTangentStore((s) => s.closeTangent);

  const createTangent = useCreateTangent(conversationId);
  const mergeTangent = useMergeTangent(conversationId);
  const branchTangent = useBranchTangent();
  const deleteThread = useDeleteThread(conversationId);

  const openTangent = useCallback(
    async (parentThreadId: string, parentMessageId: string, highlightedText: string) => {
      const tangent = await createTangent.mutateAsync({
        parentThreadId,
        highlightedText,
      });
      openTangentLocal({
        threadId: tangent.id,
        // Normalize: callers treat "main" as the main-thread parentId.
        parentThreadId: parentThreadId === mainThreadId ? "main" : parentThreadId,
        parentMessageId,
        highlightedText,
        depth: tangent.depth,
      });
    },
    [createTangent, openTangentLocal, mainThreadId]
  );

  const mergeTangentAction = useCallback(
    async (threadId: string) => {
      await mergeTangent.mutateAsync(threadId);
      closeTangentLocal(threadId);
    },
    [mergeTangent, closeTangentLocal]
  );

  const branchTangentAction = useCallback(
    async (threadId: string) => {
      const { conversation } = await branchTangent.mutateAsync(threadId);
      // Hard-delete the source — the content lives in the new conversation now.
      deleteThread.mutate(threadId);
      closeTangentLocal(threadId);
      router.push(`/c/${conversation.id}`);
    },
    [branchTangent, deleteThread, closeTangentLocal, router]
  );

  const closeTangentAction = useCallback(
    async (threadId: string) => {
      // Snap the UI closed immediately, then delete server-side. We don't
      // surface delete errors — if it fails the tangent simply reappears on
      // next page load, and a toast surface doesn't exist yet.
      closeTangentLocal(threadId);
      try {
        await deleteThread.mutateAsync(threadId);
      } catch {
        // Intentional swallow — see comment above.
      }
    },
    [deleteThread, closeTangentLocal]
  );

  return {
    openTangent,
    mergeTangent: mergeTangentAction,
    branchTangent: branchTangentAction,
    closeTangent: closeTangentAction,
  };
}
