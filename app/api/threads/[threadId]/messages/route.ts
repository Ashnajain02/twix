import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, unauthorized } from "@/lib/http";

// GET: Get all messages for a thread
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { threadId } = await params;

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { conversation: { select: { userId: true } } },
  });

  if (!thread || thread.conversation.userId !== session.user.id) {
    return notFound();
  }

  const messages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}
