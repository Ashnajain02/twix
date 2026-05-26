import { prisma } from "./prisma";
import { embedQuery, findRelevantAncestorMessages } from "./embeddings";
import {
  formatKnowledgeForContext,
  threadKnowledgeSchema,
  type ThreadKnowledge,
} from "./knowledge";
import { toAIRole, type AIRole } from "./ai";
import type { MessageRole } from "@/lib/generated/prisma/client";
import { createLogger } from "./logger";

/**
 * Context builder with hierarchical compression and semantic retrieval.
 *
 * Performance-critical: everything here runs before the first token streams.
 * Key optimizations:
 *   - Embedding API call kicks off in parallel with all DB work
 *   - Ancestor threads fetched in a single recursive-CTE query
 *   - Depth 0 skips all ancestor/embedding work entirely
 */

const log = createLogger("context");

interface ContextMessage {
  role: AIRole;
  content: string;
}

/** How many recent parent messages to keep verbatim. */
const PARENT_RECENT_COUNT = 10;

/** Max semantically retrieved messages to inject from ancestors. */
const SEMANTIC_RETRIEVAL_LIMIT = 6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreadMessageSlice {
  id: string;
  role: MessageRole;
  content: string;
}

interface MergeSlice {
  afterMessageId: string;
  summary: string | null;
  sourceThread: { knowledge: unknown; summary: string | null };
}

interface ThreadInput {
  id: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  highlightedText: string | null;
  messages: ThreadMessageSlice[];
  mergesAsTarget: MergeSlice[];
}

interface AncestorThread {
  id: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  highlightedText: string | null;
  summary: string | null;
  knowledge: unknown;
  depth: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the LLM context for a thread. Expects the thread pre-fetched with
 * its messages + merge events, so the route doesn't need a duplicate query.
 * Zero additional DB calls for depth 0 (main thread).
 */
export async function buildContextForThread(
  thread: ThreadInput,
  currentQuery?: string
): Promise<ContextMessage[]> {
  // Fast path: main thread — no ancestors, no embedding.
  if (!thread.parentThreadId || !thread.parentMessageId) {
    return buildCurrentThreadContext(thread);
  }

  // Kick off embedding immediately, in parallel with DB work.
  const embeddingPromise = currentQuery ? embedQuery(currentQuery) : null;

  // Batch-fetch the entire ancestor chain in one query.
  const ancestors = await fetchAncestorChain(thread.parentThreadId);

  const { context: ancestorContext, includedMessageIds } =
    await buildAncestorContextFromChain(
      ancestors,
      thread.parentMessageId,
      thread.highlightedText
    );

  const currentContext = buildCurrentThreadContext(thread);

  // Semantic retrieval — runs after the embedding completes.
  let retrievalBlock: ContextMessage[] = [];
  if (embeddingPromise && ancestors.length > 0) {
    const embedding = await embeddingPromise;
    if (embedding) {
      const relevantMessages = await findRelevantAncestorMessages(
        embedding,
        ancestors.map((a) => a.id),
        SEMANTIC_RETRIEVAL_LIMIT,
        Array.from(includedMessageIds)
      );
      if (relevantMessages.length > 0) {
        retrievalBlock = buildRetrievalBlock(relevantMessages);
      }
    }
  }

  return [...ancestorContext, ...retrievalBlock, ...currentContext];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely validate a `knowledge` JSON value. Returns null for missing or
 * malformed data so callers degrade to the plaintext summary fallback.
 */
function parseKnowledge(value: unknown): ThreadKnowledge | null {
  if (value === null || value === undefined) return null;
  const parsed = threadKnowledgeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  log.warn("malformed thread knowledge JSON; falling back to summary", {
    issues: parsed.error.issues.length,
  });
  return null;
}

async function fetchAncestorChain(
  startThreadId: string
): Promise<AncestorThread[]> {
  return prisma.$queryRaw<AncestorThread[]>`
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
}

async function buildAncestorContextFromChain(
  ancestors: AncestorThread[],
  branchMessageId: string,
  highlightedText: string | null
): Promise<{ context: ContextMessage[]; includedMessageIds: Set<string> }> {
  const context: ContextMessage[] = [];
  const includedMessageIds = new Set<string>();

  if (ancestors.length === 0) return { context, includedMessageIds };

  // Grandparent+ threads: structured knowledge (or plain summary fallback).
  for (let i = 0; i < ancestors.length - 1; i++) {
    const ancestor = ancestors[i];
    const childHighlight = ancestors[i + 1]?.highlightedText ?? null;

    const knowledge = parseKnowledge(ancestor.knowledge);
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

  // Immediate parent: knowledge + recent verbatim messages.
  const parent = ancestors[ancestors.length - 1];

  const parentMessages = await prisma.message.findMany({
    where: { threadId: parent.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });

  const cutoffIndex = parentMessages.findIndex((m) => m.id === branchMessageId);
  const relevantMessages = parentMessages.slice(0, cutoffIndex + 1);

  const knowledge = parseKnowledge(parent.knowledge);
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
      context.push({ role: toAIRole(msg.role), content: msg.content });
      includedMessageIds.add(msg.id);
    }
  } else {
    for (const msg of relevantMessages) {
      context.push({ role: toAIRole(msg.role), content: msg.content });
      includedMessageIds.add(msg.id);
    }
  }

  if (highlightedText) {
    context.push({
      role: "system",
      content:
        `[Tangent thread opened. The user highlighted the following text to explore further: "${highlightedText}". ` +
        "Focus your responses on this topic. Use the same formatting rules as the main thread — " +
        "all source citations must be clickable markdown links with real URLs, never plain text labels like [Source].]",
    });
  }

  return { context, includedMessageIds };
}

function buildCurrentThreadContext(thread: ThreadInput): ContextMessage[] {
  const context: ContextMessage[] = [];
  const mergeMap = buildMergeMap(thread.mergesAsTarget);

  for (const msg of thread.messages) {
    context.push({ role: toAIRole(msg.role), content: msg.content });
    const mergedContext = mergeMap.get(msg.id);
    if (mergedContext) context.push(...mergedContext);
  }

  return context;
}

function buildRetrievalBlock(
  messages: Array<{ role: MessageRole; content: string }>
): ContextMessage[] {
  const block: ContextMessage[] = [
    {
      role: "system",
      content:
        "[The following messages were retrieved from earlier in the conversation " +
        "because they are semantically relevant to the current discussion:]",
    },
  ];

  for (const msg of messages) {
    block.push({ role: toAIRole(msg.role), content: msg.content });
  }

  block.push({ role: "system", content: "[End of retrieved context.]" });
  return block;
}

function buildMergeMap(merges: MergeSlice[]): Map<string, ContextMessage[]> {
  const mergeMap = new Map<string, ContextMessage[]>();

  for (const merge of merges) {
    const tangentContext: ContextMessage[] = [];
    const knowledge = parseKnowledge(merge.sourceThread.knowledge);

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

    if (tangentContext.length === 0) continue;

    tangentContext.push({
      role: "system",
      content: "[End of merged tangent context.]",
    });

    const existing = mergeMap.get(merge.afterMessageId);
    if (existing) existing.push(...tangentContext);
    else mergeMap.set(merge.afterMessageId, tangentContext);
  }

  return mergeMap;
}
