import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, tooManyRequests, unauthorized } from "@/lib/http";
import { generateMergeSummary } from "@/lib/merge";
import { collectActiveDescendants } from "@/lib/thread-tree";
import { createLogger } from "@/lib/logger";
import { createRateLimit } from "@/lib/rate-limit";

const log = createLogger("merge");

// 15 merges / minute per user — merges trigger an LLM summary call.
const limiter = createRateLimit({ max: 15, windowMs: 60_000 });

// POST: Merge this tangent thread into its parent
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const rl = limiter.check(`u:${session.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const { threadId } = await params;

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
    return badRequest("Cannot merge the main thread");
  }
  if (thread.status !== "ACTIVE") {
    return badRequest("Thread is already merged or archived");
  }

  // Fetch latest parent message + active descendants in parallel.
  const [latestParentMessage, descendants] = await Promise.all([
    prisma.message.findFirst({
      where: { threadId: thread.parentThreadId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    collectActiveDescendants(thread.conversationId, threadId),
  ]);

  if (!latestParentMessage) {
    return badRequest("Parent thread has no messages");
  }

  const mergeEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.mergeEvent.create({
      data: {
        sourceThreadId: threadId,
        targetThreadId: thread.parentThreadId!,
        afterMessageId: latestParentMessage.id,
        summary: null, // filled in asynchronously below
      },
    });

    await tx.thread.update({
      where: { id: threadId },
      data: { status: "MERGED", mergedAt: new Date() },
    });

    if (descendants.length > 0) {
      await tx.thread.updateMany({
        where: { id: { in: descendants } },
        data: { status: "ARCHIVED" },
      });
    }

    return event;
  });

  // Fire-and-forget: generate AI summary and backfill it
  generateMergeSummary(threadId)
    .then((summary) =>
      prisma.mergeEvent.update({
        where: { id: mergeEvent.id },
        data: { summary },
      })
    )
    .catch((err) => log.error("merge summary backfill failed", err));

  return NextResponse.json(mergeEvent);
}
