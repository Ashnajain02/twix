import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, unauthorized, zodError } from "@/lib/http";
import { updateConversationSchema } from "@/lib/validators";

// GET: Get conversation with its thread tree
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { threads: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return notFound();
  }

  return NextResponse.json(conversation);
}

// PATCH: Update conversation title
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { conversationId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateConversationSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  // Update + ownership check in one statement.
  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, userId: session.user.id },
    data: { title: parsed.data.title },
  });

  if (result.count === 0) return notFound();

  const updated = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  return NextResponse.json(updated);
}

// DELETE: Delete conversation and all related data
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { conversationId } = await params;

  // updateMany returns count — gives us a one-statement auth-checked existence test.
  const owned = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
    select: { id: true, threads: { select: { id: true } } },
  });

  if (!owned) return notFound();

  const threadIds = owned.threads.map((t) => t.id);

  // Conversation → threads → messages cascade is correct in the schema; the
  // self-referential Thread parentThreadId/parentMessageId FKs default to
  // SET NULL (see schema migration). MergeEvents have no cascade configured,
  // so we delete them explicitly.
  await prisma.$transaction(async (tx) => {
    if (threadIds.length > 0) {
      await tx.mergeEvent.deleteMany({
        where: {
          OR: [
            { sourceThreadId: { in: threadIds } },
            { targetThreadId: { in: threadIds } },
          ],
        },
      });
      // Clear self-referential FKs first so cascade-delete from Conversation works
      await tx.thread.updateMany({
        where: { conversationId },
        data: { parentThreadId: null, parentMessageId: null },
      });
    }
    await tx.conversation.delete({ where: { id: conversationId } });
  });

  return new Response(null, { status: 204 });
}
