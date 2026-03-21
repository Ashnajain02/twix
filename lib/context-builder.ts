import { prisma } from "./prisma";

interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Recursively builds the full context message array for a given thread.
 *
 * Strategy:
 * 1. If this thread has a parent (it's a tangent), include the parent's
 *    messages up to and including parentMessageId as inherited context.
 * 2. Add a system message noting the highlighted text focus.
 * 3. Add this thread's own messages.
 * 4. After each message, inject any merged tangent contexts at the
 *    appropriate merge points.
 *
 * Recursion bottoms out at the main thread (depth 0, no parent).
 */
export async function buildContextForThread(
  threadId: string
): Promise<ContextMessage[]> {
  // Fetch thread metadata first (lightweight query) to check if we need parent messages
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true },
      },
      mergesAsTarget: {
        include: {
          sourceThread: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                select: { role: true, content: true },
                take: 8,
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread) throw new Error(`Thread ${threadId} not found`);

  const context: ContextMessage[] = [];

  // Step 1: Inherit parent context if this is a tangent thread
  if (thread.parentThreadId && thread.parentMessageId) {
    // NOTE: This query only runs for tangent threads (not main thread),
    // so the main-thread hot path has zero extra DB calls.
    const parentMessages = await prisma.message.findMany({
      where: { threadId: thread.parentThreadId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true },
    });

    const cutoffIndex = parentMessages.findIndex(
      (m) => m.id === thread.parentMessageId
    );
    const relevantParentMessages = parentMessages.slice(0, cutoffIndex + 1);

    for (const msg of relevantParentMessages) {
      context.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
    }

    // Step 2: Add focus context
    if (thread.highlightedText) {
      context.push({
        role: "system",
        content: `[Tangent thread opened. The user highlighted the following text to explore further: "${thread.highlightedText}". Focus your responses on this topic. Use the same formatting rules as the main thread — all source citations must be clickable markdown links with real URLs, never plain text labels like [Source].]`,
      });
    }
  }

  // Step 3: Add this thread's own messages, injecting merge contexts
  const mergeMap = new Map<string, ContextMessage[]>();
  for (const merge of thread.mergesAsTarget) {
    const tangentContext: ContextMessage[] = [];
    if (merge.summary) {
      tangentContext.push({
        role: "system",
        content: `[Merged tangent thread summary: ${merge.summary}]`,
      });
    }
    for (const msg of merge.sourceThread.messages) {
      tangentContext.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
    }
    tangentContext.push({
      role: "system",
      content: "[End of merged tangent thread context.]",
    });

    const existing = mergeMap.get(merge.afterMessageId) || [];
    existing.push(...tangentContext);
    mergeMap.set(merge.afterMessageId, existing);
  }

  for (const msg of thread.messages) {
    context.push({
      role: msg.role.toLowerCase() as ContextMessage["role"],
      content: msg.content,
    });

    // After this message, inject any merged tangent contexts
    const mergedContext = mergeMap.get(msg.id);
    if (mergedContext) {
      context.push(...mergedContext);
    }
  }

  return context;
}
