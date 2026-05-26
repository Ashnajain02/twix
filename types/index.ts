/**
 * Shared types.
 *
 * Database model types are re-exported from Prisma's generated client —
 * never hand-rolled here, since they drift the moment the schema changes.
 */

export type { MergeEvent, MessageRole, ThreadStatus } from "@/lib/generated/prisma/client";

/**
 * Client-side UI state for an open tangent window. Not a DB row.
 */
export interface TangentWindowState {
  threadId: string;
  parentThreadId: string;
  parentMessageId: string;
  highlightedText: string;
  depth: number;
}
