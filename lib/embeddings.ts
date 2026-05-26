import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "./prisma";
import { Prisma, type MessageRole } from "@/lib/generated/prisma/client";
import { createLogger } from "./logger";

/**
 * Embedding service for semantic similarity search over the conversation tree.
 *
 * Architecture:
 *   - Embeddings are generated eagerly (fire-and-forget after message persistence)
 *   - Stored as pgvector columns on the messages table
 *   - Retrieved via HNSW-indexed cosine similarity queries
 *   - Scoped to ancestor thread chains (topology-aware, not flat)
 *
 * Model: text-embedding-3-small (1536 dimensions, $0.02/1M tokens)
 */

const log = createLogger("embeddings");
const embeddingModel = openai.embedding("text-embedding-3-small");

/** Skip embedding very short messages — they add noise without semantic signal. */
const MIN_CONTENT_LENGTH = 20;

/** Embedding models cap input — truncate before sending. */
const MAX_INPUT_CHARS = 8000;

/** Don't inject messages with cosine similarity below this. */
const SIMILARITY_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/**
 * Generate an embedding for a single message and store it.
 * Intended to be fire-and-forget after message persistence.
 *
 * Skips system messages and messages below MIN_CONTENT_LENGTH.
 */
export async function embedMessage(messageId: string): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, content: true, role: true },
  });

  if (!message) return;
  if (message.role === "SYSTEM") return;
  if (message.content.length < MIN_CONTENT_LENGTH) return;

  const text = message.content.slice(0, MAX_INPUT_CHARS);
  const { embedding } = await embed({ model: embeddingModel, value: text });

  const vectorLiteral = `[${embedding.join(",")}]`;

  await prisma.$executeRaw`
    UPDATE "messages"
    SET "embedding" = ${vectorLiteral}::vector
    WHERE "id" = ${messageId}
  `;
}

/**
 * Embed a free-form query string. Returns null on failure rather than throwing
 * so callers can degrade gracefully (e.g. skip semantic retrieval).
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query.slice(0, MAX_INPUT_CHARS),
    });
    return embedding;
  } catch (err) {
    log.error("query embedding failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

export interface RetrievedMessage {
  id: string;
  role: MessageRole;
  content: string;
  threadId: string;
  similarity: number;
}

/**
 * Finds the most semantically relevant messages within a set of ancestor
 * threads. Scoped retrieval (not flat document RAG) — respects tree topology.
 *
 * @param queryEmbedding  Embedding of the user's current message
 * @param threadIds       Ancestor thread IDs to search within
 * @param limit           Max messages to return
 * @param excludeIds      Message IDs to skip (already in the verbatim window)
 */
export async function findRelevantAncestorMessages(
  queryEmbedding: number[],
  threadIds: string[],
  limit = 8,
  excludeIds: string[] = []
): Promise<RetrievedMessage[]> {
  if (threadIds.length === 0) return [];

  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  return prisma.$queryRaw<RetrievedMessage[]>`
    SELECT
      "id",
      "role",
      "content",
      "thread_id" AS "threadId",
      1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "messages"
    WHERE "thread_id" IN (${Prisma.join(threadIds)})
      AND "embedding" IS NOT NULL
      ${excludeIds.length > 0 ? Prisma.sql`AND "id" NOT IN (${Prisma.join(excludeIds)})` : Prisma.empty}
      AND 1 - ("embedding" <=> ${vectorLiteral}::vector) > ${SIMILARITY_THRESHOLD}
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}
