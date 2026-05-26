import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, unauthorized, zodError } from "@/lib/http";
import { createTangentSchema } from "@/lib/validators";

// POST: Create a new tangent thread
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return notFound();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createTangentSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { parentThreadId, highlightedText } = parsed.data;

  // Validate parent thread belongs to this conversation
  const parentThread = await prisma.thread.findUnique({
    where: { id: parentThreadId },
    select: { conversationId: true, depth: true },
  });

  if (!parentThread || parentThread.conversationId !== conversationId) {
    return badRequest("Parent thread not found in this conversation");
  }

  // Resolve the latest message in the parent thread server-side.
  // The client cannot reliably pass a DB message ID because the AI SDK
  // assigns its own ephemeral IDs to streamed messages.
  const latestMessage = await prisma.message.findFirst({
    where: { threadId: parentThreadId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const tangentThread = await prisma.thread.create({
    data: {
      conversationId,
      parentThreadId,
      parentMessageId: latestMessage?.id ?? null,
      highlightedText,
      depth: parentThread.depth + 1,
      status: "ACTIVE",
    },
  });

  return NextResponse.json(tangentThread, { status: 201 });
}
