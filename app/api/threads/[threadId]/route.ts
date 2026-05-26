import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized, zodError } from "@/lib/http";
import { archiveThreadSchema } from "@/lib/validators";
import { collectActiveDescendants } from "@/lib/thread-tree";

// GET: Get thread details including merge events
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { threadId } = await params;

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      conversation: { select: { userId: true } },
      mergesAsTarget: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!thread || thread.conversation.userId !== session.user.id) {
    return notFound();
  }

  return NextResponse.json(thread);
}

// PATCH: Archive a tangent thread (and cascade-archive its ACTIVE descendants)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { threadId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = archiveThreadSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      conversationId: true,
      parentThreadId: true,
      status: true,
      conversation: { select: { userId: true } },
    },
  });

  if (!thread || thread.conversation.userId !== session.user.id) {
    return notFound();
  }

  if (!thread.parentThreadId) {
    return badRequest("Cannot archive the main thread");
  }

  // Already archived or merged — idempotent success.
  if (thread.status !== "ACTIVE") {
    return NextResponse.json({ archived: [] });
  }

  const descendants = await collectActiveDescendants(
    thread.conversationId,
    threadId
  );
  const archived = [threadId, ...descendants];

  await prisma.thread.updateMany({
    where: { id: { in: archived } },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ archived });
}

// DELETE: Hard-delete this tangent thread + all descendants (regardless of
// status) + any merge events involving them. Used by the chat UI when a user
// closes a tangent via the X button or branches it into a standalone
// conversation — in both cases the original tangent should leave no trace.
// Refuses to delete the conversation's main thread (the one with no parent).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { threadId } = await params;

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      parentThreadId: true,
      conversation: { select: { userId: true } },
    },
  });

  if (!thread || thread.conversation.userId !== session.user.id) {
    return notFound();
  }
  if (!thread.parentThreadId) {
    return badRequest("Cannot delete the main thread");
  }

  // Walk all descendants (regardless of status) so the delete cascade is
  // total — no orphaned threads, no orphaned merge events.
  const descendants = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE chain AS (
      SELECT "id" FROM "threads" WHERE "parent_thread_id" = ${threadId}
      UNION ALL
      SELECT t."id" FROM "threads" t
      JOIN chain c ON t."parent_thread_id" = c."id"
    )
    SELECT "id" FROM chain
  `;

  const allIds = [threadId, ...descendants.map((d) => d.id)];

  await prisma.$transaction([
    // Drop merge events first — FK from merge_events.{source,target}_thread_id
    // → threads is RESTRICT, so we'd otherwise fail. (after_message_id points
    // to messages in the *target* thread, which is in our set if relevant.)
    prisma.mergeEvent.deleteMany({
      where: {
        OR: [
          { sourceThreadId: { in: allIds } },
          { targetThreadId: { in: allIds } },
        ],
      },
    }),
    // Now drop the threads — Message rows cascade via the FK already.
    prisma.thread.deleteMany({ where: { id: { in: allIds } } }),
  ]);

  return new Response(null, { status: 204 });
}
