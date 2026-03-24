import { prisma } from "./prisma";

interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** How many recent parent messages to keep in full (for the immediate parent). */
const PARENT_RECENT_MESSAGE_COUNT = 10;

/**
 * Builds the full context message array for a given thread, using
 * hierarchical compression to reduce token usage at deeper levels.
 *
 * Compression strategy:
 * - Current thread (depth N):    ALL messages in full + merged tangent context
 * - Immediate parent (depth N-1): summary of older messages + last 10 messages in full
 * - Grandparent+ (depth <= N-2):  paragraph summary only
 *
 * This ensures the AI always has full detail for the active conversation,
 * good detail for the immediate parent, and compressed context for
 * distant ancestors — preventing token explosion in deep branch chains.
 */
export async function buildContextForThread(
  threadId: string
): Promise<ContextMessage[]> {
  // Fetch thread with its messages and merged tangent data
  const thread = await prisma.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      mergesAsTarget: {
        include: {
          sourceThread: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const context: ContextMessage[] = [];

  // Step 1: Build ancestor context (compressed) if this is a tangent
  if (thread.parentThreadId && thread.parentMessageId) {
    const ancestorContext = await buildAncestorContext(
      thread.parentThreadId,
      thread.parentMessageId,
      thread.highlightedText
    );
    context.push(...ancestorContext);
  }

  // Step 2: Add this thread's own messages with merged tangent injection
  const mergeMap = new Map<string, ContextMessage[]>();
  for (const merge of thread.mergesAsTarget) {
    const tangentContext: ContextMessage[] = [];
    // Use summary from the merge event, or fall back to the thread's own summary
    const summary = merge.summary || merge.sourceThread.summary;
    if (summary) {
      tangentContext.push({
        role: "system",
        content: `[Merged tangent thread summary: ${summary}]`,
      });
    }
    if (tangentContext.length > 0) {
      tangentContext.push({
        role: "system",
        content: "[End of merged tangent thread context.]",
      });
      const existing = mergeMap.get(merge.afterMessageId) || [];
      existing.push(...tangentContext);
      mergeMap.set(merge.afterMessageId, existing);
    }
  }

  for (const msg of thread.messages) {
    context.push({
      role: msg.role.toLowerCase() as ContextMessage["role"],
      content: msg.content,
    });

    const mergedContext = mergeMap.get(msg.id);
    if (mergedContext) {
      context.push(...mergedContext);
    }
  }

  return context;
}

/**
 * Builds compressed context for an ancestor thread chain.
 *
 * For the immediate parent: includes a summary of older messages (if available)
 * plus the last PARENT_RECENT_MESSAGE_COUNT messages in full, up to the cutoff.
 *
 * For grandparents and above: recursively includes only their paragraph summary.
 */
async function buildAncestorContext(
  parentThreadId: string,
  parentMessageId: string,
  highlightedText: string | null
): Promise<ContextMessage[]> {
  const parentThread = await prisma.thread.findUnique({
    where: { id: parentThreadId },
    select: {
      id: true,
      parentThreadId: true,
      parentMessageId: true,
      highlightedText: true,
      summary: true,
      depth: true,
    },
  });

  if (!parentThread) return [];

  const context: ContextMessage[] = [];

  // If this parent also has a parent (grandparent+), use summary-only compression
  if (parentThread.parentThreadId && parentThread.parentMessageId) {
    const grandparentContext = await buildGrandparentContext(
      parentThread.parentThreadId,
      parentThread.highlightedText
    );
    context.push(...grandparentContext);
  }

  // Fetch parent messages up to the cutoff point
  const parentMessages = await prisma.message.findMany({
    where: { threadId: parentThreadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });

  const cutoffIndex = parentMessages.findIndex(
    (m) => m.id === parentMessageId
  );
  const relevantMessages = parentMessages.slice(0, cutoffIndex + 1);

  // If there's a stored summary and we have more messages than the recent window,
  // use the summary for older messages and only include recent ones in full
  if (
    parentThread.summary &&
    relevantMessages.length > PARENT_RECENT_MESSAGE_COUNT
  ) {
    context.push({
      role: "system",
      content: `[Summary of earlier conversation in parent thread: ${parentThread.summary}]`,
    });

    // Only include the last N messages in full
    const recentMessages = relevantMessages.slice(-PARENT_RECENT_MESSAGE_COUNT);
    for (const msg of recentMessages) {
      context.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
    }
  } else {
    // Thread is short enough or no summary available — include all messages
    for (const msg of relevantMessages) {
      context.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
    }
  }

  // Add the tangent focus marker
  if (highlightedText) {
    context.push({
      role: "system",
      content: `[Tangent thread opened. The user highlighted the following text to explore further: "${highlightedText}". Focus your responses on this topic. Use the same formatting rules as the main thread — all source citations must be clickable markdown links with real URLs, never plain text labels like [Source].]`,
    });
  }

  return context;
}

/**
 * Builds summary-only context for grandparent and higher ancestor threads.
 * Recursively walks up the tree, emitting only paragraph summaries.
 */
async function buildGrandparentContext(
  threadId: string,
  childHighlightedText: string | null
): Promise<ContextMessage[]> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      parentThreadId: true,
      parentMessageId: true,
      highlightedText: true,
      summary: true,
    },
  });

  if (!thread) return [];

  const context: ContextMessage[] = [];

  // Recurse up to higher ancestors first
  if (thread.parentThreadId) {
    const higherContext = await buildGrandparentContext(
      thread.parentThreadId,
      thread.highlightedText
    );
    context.push(...higherContext);
  }

  // Emit this ancestor's summary
  if (thread.summary) {
    context.push({
      role: "system",
      content: `[Ancestor thread summary (depth context): ${thread.summary}]`,
    });
  }

  // Note the tangent transition
  if (childHighlightedText) {
    context.push({
      role: "system",
      content: `[A tangent was opened from this thread to explore: "${childHighlightedText}"]`,
    });
  }

  return context;
}
