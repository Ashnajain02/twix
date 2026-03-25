import { prisma } from "./prisma";
import { findRelevantAncestorMessages } from "./embeddings";
import {
  formatKnowledgeForContext,
  type ThreadKnowledge,
} from "./knowledge";

/**
 * Context builder with hierarchical compression and semantic retrieval.
 *
 * Performance-critical: everything here runs before the first token streams.
 * Key optimizations:
 *   - Embedding API call starts immediately and runs in parallel with DB work
 *   - All ancestor threads fetched in a single batch query (no recursive waterfall)
 *   - Ancestor IDs collected during traversal (no duplicate CTE)
 *   - Main thread (depth 0) skips all ancestor/embedding work entirely
 */

interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** How many recent parent messages to keep verbatim (for immediate parent). */
const PARENT_RECENT_COUNT = 10;

/** Max semantically retrieved messages to inject from ancestors. */
const SEMANTIC_RETRIEVAL_LIMIT = 6;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Accepts the pre-fetched thread (with messages + merges already loaded)
 * so the route doesn't need a duplicate query. Zero additional DB calls
 * for depth 0.
 */
export async function buildContextForThread(
  thread: {
    id: string;
    parentThreadId: string | null;
    parentMessageId: string | null;
    highlightedText: string | null;
    messages: Array<{ id: string; role: string; content: string }>;
    mergesAsTarget: Array<{
      afterMessageId: string;
      summary: string | null;
      sourceThread: { knowledge: unknown; summary: string | null };
    }>;
  },
  currentQuery?: string
): Promise<ContextMessage[]> {

  // ── Fast path: main thread (depth 0) — no ancestors, no embedding needed ──
  if (!thread.parentThreadId || !thread.parentMessageId) {
    return buildCurrentThreadContext(thread);
  }

  // ── Tangent path: need ancestor context + optional semantic retrieval ──

  // Start embedding the query NOW, in parallel with all DB work.
  // This is the single most expensive call (~300-500ms to OpenAI).
  // We don't await it until we actually need the results.
  const embeddingPromise = currentQuery
    ? startEmbeddingEarly(currentQuery)
    : null;

  // Batch-fetch all ancestor threads in ONE query instead of N sequential ones.
  // Returns them ordered from root → immediate parent.
  const ancestors = await fetchAncestorChain(thread.parentThreadId);

  // Build compressed ancestor context from the batch result
  const { context: ancestorContext, includedMessageIds } =
    await buildAncestorContextFromChain(
      ancestors,
      thread.parentMessageId,
      thread.highlightedText
    );

  // Build current thread context
  const currentContext = buildCurrentThreadContext(thread);

  // ── Semantic retrieval (runs in parallel with nothing — embedding started early) ──
  let retrievalBlock: ContextMessage[] = [];

  if (embeddingPromise && ancestors.length > 0) {
    const ancestorIds = ancestors.map((a) => a.id);
    const embedding = await embeddingPromise;

    if (embedding) {
      const relevantMessages = await findRelevantAncestorMessages(
        embedding,
        ancestorIds,
        SEMANTIC_RETRIEVAL_LIMIT,
        Array.from(includedMessageIds)
      );

      if (relevantMessages.length > 0) {
        retrievalBlock = buildRetrievalBlock(relevantMessages);
      }
    }
  }

  // Assemble: ancestors → retrieval → current thread
  return [...ancestorContext, ...retrievalBlock, ...currentContext];
}

// ---------------------------------------------------------------------------
// Early embedding (parallel with DB work)
// ---------------------------------------------------------------------------

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

const embeddingModel = openai.embedding("text-embedding-3-small");

/**
 * Starts the embedding API call immediately and returns a promise.
 * Returns the raw embedding vector, or null on failure.
 * This runs in parallel with all the DB queries.
 */
async function startEmbeddingEarly(
  query: string
): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query.slice(0, 8000),
    });
    return embedding;
  } catch (err) {
    console.error("[context-builder] Embedding failed, skipping retrieval:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch ancestor fetching (replaces recursive waterfall)
// ---------------------------------------------------------------------------

interface AncestorThread {
  id: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  highlightedText: string | null;
  summary: string | null;
  knowledge: unknown;
  depth: number;
}

/**
 * Fetches the entire ancestor chain in a SINGLE query.
 * Returns threads ordered root-first (depth 0 → immediate parent).
 *
 * Replaces the old recursive buildGrandparentContext which did
 * one DB round-trip per ancestor level.
 */
async function fetchAncestorChain(
  startThreadId: string
): Promise<AncestorThread[]> {
  const ancestors = await prisma.$queryRaw<AncestorThread[]>`
    WITH RECURSIVE chain AS (
      SELECT "id", "parent_thread_id" AS "parentThreadId",
             "parent_message_id" AS "parentMessageId",
             "highlighted_text" AS "highlightedText",
             "summary", "knowledge", "depth"
      FROM "threads"
      WHERE "id" = ${startThreadId}

      UNION ALL

      SELECT t."id", t."parent_thread_id", t."parent_message_id",
             t."highlighted_text", t."summary", t."knowledge", t."depth"
      FROM "threads" t
      JOIN chain c ON t."id" = c."parentThreadId"
    )
    SELECT * FROM chain
    ORDER BY "depth" ASC
  `;

  return ancestors;
}

// ---------------------------------------------------------------------------
// Ancestor context assembly (from batch data, no more waterfall)
// ---------------------------------------------------------------------------

/**
 * Builds ancestor context from the pre-fetched chain.
 * No additional DB calls for thread metadata — everything came from the batch.
 *
 * Only makes ONE extra DB call: fetching the immediate parent's messages
 * (needed for the verbatim recent messages window).
 */
async function buildAncestorContextFromChain(
  ancestors: AncestorThread[],
  branchMessageId: string,
  highlightedText: string | null
): Promise<{ context: ContextMessage[]; includedMessageIds: Set<string> }> {
  const context: ContextMessage[] = [];
  const includedMessageIds = new Set<string>();

  if (ancestors.length === 0) {
    return { context, includedMessageIds };
  }

  // Grandparent+ threads (all except the last one): knowledge-only
  for (let i = 0; i < ancestors.length - 1; i++) {
    const ancestor = ancestors[i];
    const childHighlight = ancestors[i + 1]?.highlightedText ?? null;

    const knowledge = ancestor.knowledge as ThreadKnowledge | null;
    if (knowledge) {
      context.push({
        role: "system",
        content: formatKnowledgeForContext(
          knowledge,
          `ancestor thread (depth ${ancestor.depth})`
        ),
      });
    } else if (ancestor.summary) {
      context.push({
        role: "system",
        content: `[Ancestor thread summary (depth ${ancestor.depth}): ${ancestor.summary}]`,
      });
    }

    if (childHighlight) {
      context.push({
        role: "system",
        content: `[A tangent was opened from this thread to explore: "${childHighlight}"]`,
      });
    }
  }

  // Immediate parent (last in the chain): knowledge + recent verbatim messages
  const parent = ancestors[ancestors.length - 1];

  // This is the only additional DB call — fetch parent's messages up to branch point
  const parentMessages = await prisma.message.findMany({
    where: { threadId: parent.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });

  const cutoffIndex = parentMessages.findIndex(
    (m) => m.id === branchMessageId
  );
  const relevantMessages = parentMessages.slice(0, cutoffIndex + 1);

  const knowledge = parent.knowledge as ThreadKnowledge | null;
  const hasCompressedContext = knowledge || parent.summary;
  const isLongEnoughToCompress = relevantMessages.length > PARENT_RECENT_COUNT;

  if (hasCompressedContext && isLongEnoughToCompress) {
    if (knowledge) {
      context.push({
        role: "system",
        content: formatKnowledgeForContext(
          knowledge,
          `parent thread (depth ${parent.depth})`
        ),
      });
    } else if (parent.summary) {
      context.push({
        role: "system",
        content: `[Summary of earlier conversation in parent thread: ${parent.summary}]`,
      });
    }

    const recentMessages = relevantMessages.slice(-PARENT_RECENT_COUNT);
    for (const msg of recentMessages) {
      context.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
      includedMessageIds.add(msg.id);
    }
  } else {
    for (const msg of relevantMessages) {
      context.push({
        role: msg.role.toLowerCase() as ContextMessage["role"],
        content: msg.content,
      });
      includedMessageIds.add(msg.id);
    }
  }

  if (highlightedText) {
    context.push({
      role: "system",
      content:
        `[Tangent thread opened. The user highlighted the following text to explore further: "${highlightedText}". ` +
        `Focus your responses on this topic. Use the same formatting rules as the main thread — ` +
        `all source citations must be clickable markdown links with real URLs, never plain text labels like [Source].]`,
    });
  }

  return { context, includedMessageIds };
}

// ---------------------------------------------------------------------------
// Current thread context
// ---------------------------------------------------------------------------

function buildCurrentThreadContext(
  thread: {
    messages: Array<{ id: string; role: string; content: string }>;
    mergesAsTarget: Array<{
      afterMessageId: string;
      summary: string | null;
      sourceThread: { knowledge: unknown; summary: string | null };
    }>;
  }
): ContextMessage[] {
  const context: ContextMessage[] = [];
  const mergeMap = buildMergeMap(thread.mergesAsTarget);

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

// ---------------------------------------------------------------------------
// Semantic retrieval formatting
// ---------------------------------------------------------------------------

function buildRetrievalBlock(
  messages: Array<{ role: string; content: string; similarity: number }>
): ContextMessage[] {
  const block: ContextMessage[] = [];

  block.push({
    role: "system",
    content:
      "[The following messages were retrieved from earlier in the conversation " +
      "because they are semantically relevant to the current discussion:]",
  });

  for (const msg of messages) {
    block.push({
      role: msg.role.toLowerCase() as ContextMessage["role"],
      content: msg.content,
    });
  }

  block.push({
    role: "system",
    content: "[End of retrieved context.]",
  });

  return block;
}

// ---------------------------------------------------------------------------
// Merged tangent handling
// ---------------------------------------------------------------------------

function buildMergeMap(
  merges: Array<{
    afterMessageId: string;
    summary: string | null;
    sourceThread: { knowledge: unknown; summary: string | null };
  }>
): Map<string, ContextMessage[]> {
  const mergeMap = new Map<string, ContextMessage[]>();

  for (const merge of merges) {
    const tangentContext: ContextMessage[] = [];
    const knowledge = merge.sourceThread.knowledge as ThreadKnowledge | null;

    if (knowledge) {
      tangentContext.push({
        role: "system",
        content: formatKnowledgeForContext(knowledge, "merged tangent"),
      });
    } else {
      const summary = merge.summary || merge.sourceThread.summary;
      if (summary) {
        tangentContext.push({
          role: "system",
          content: `[Merged tangent thread summary: ${summary}]`,
        });
      }
    }

    if (tangentContext.length > 0) {
      tangentContext.push({
        role: "system",
        content: "[End of merged tangent context.]",
      });

      const existing = mergeMap.get(merge.afterMessageId) || [];
      existing.push(...tangentContext);
      mergeMap.set(merge.afterMessageId, existing);
    }
  }

  return mergeMap;
}
