import { NextResponse } from "next/server";
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatModel } from "@/lib/ai";
import { notFound, tooManyRequests, unauthorized } from "@/lib/http";
import { createLogger } from "@/lib/logger";
import { createRateLimit } from "@/lib/rate-limit";

const log = createLogger("branch");

// 10 branches / minute per user — branching is an LLM-backed operation.
const limiter = createRateLimit({ max: 10, windowMs: 60_000 });

// POST: Branch a tangent thread into its own standalone conversation.
// Copies the tangent's messages into a new main thread so the user can
// continue the conversation independently. Preserves merge events so
// the MergeIndicator UI works exactly the same.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const userId = session.user.id;

  const rl = limiter.check(`u:${userId}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const { threadId } = await params;

  const sourceThread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      conversation: { select: { userId: true } },
      mergesAsTarget: {
        orderBy: { createdAt: "asc" },
        select: {
          sourceThreadId: true,
          afterMessageId: true,
          summary: true,
        },
      },
    },
  });

  if (!sourceThread || sourceThread.conversation.userId !== userId) {
    return notFound();
  }

  const title = sourceThread.highlightedText
    ? sourceThread.highlightedText.slice(0, 50)
    : "Branched conversation";

  // Copy USER + ASSISTANT messages only (SYSTEM is context for the original thread).
  const copiedMessages = sourceThread.messages
    .filter((m) => m.role !== "SYSTEM")
    .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }));

  const oldMessageIds = sourceThread.messages
    .filter((m) => m.role !== "SYSTEM")
    .map((m) => m.id);

  // Preamble messages contextualizing the branch for the user.
  const firstMessageTime = copiedMessages[0]?.createdAt ?? new Date();
  const systemTime = new Date(firstMessageTime.getTime() - 2000);
  const bubbleTime = new Date(firstMessageTime.getTime() - 1000);

  const preamble = sourceThread.highlightedText
    ? [
        {
          role: "SYSTEM" as const,
          content: `This conversation was branched from a parent discussion to explore the following highlighted text: "${sourceThread.highlightedText}". The messages below are from the original tangent thread.`,
          createdAt: systemTime,
        },
        {
          role: "ASSISTANT" as const,
          content: `> **Branched from:** "${sourceThread.highlightedText.replace(/\n/g, "\n> ")}"`,
          createdAt: bubbleTime,
        },
      ]
    : [];

  const preambleCount = preamble.length;

  const result = await prisma.$transaction(async (tx) => {
    const newConversation = await tx.conversation.create({
      data: {
        userId,
        title,
        threads: {
          create: {
            depth: 0,
            status: "ACTIVE",
            messages: { create: [...preamble, ...copiedMessages] },
          },
        },
      },
      include: {
        threads: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              select: { id: true },
            },
          },
        },
      },
    });

    const newThread = newConversation.threads[0];
    const newMessageIds = newThread.messages.map((m) => m.id);

    // Map old message IDs → new ones (skipping preamble), used to remap merge events.
    const oldToNewId = new Map<string, string>();
    for (let i = 0; i < oldMessageIds.length; i++) {
      const newIdx = preambleCount + i;
      if (newIdx < newMessageIds.length) {
        oldToNewId.set(oldMessageIds[i], newMessageIds[newIdx]);
      }
    }

    for (const merge of sourceThread.mergesAsTarget) {
      const newAfterMessageId = oldToNewId.get(merge.afterMessageId);
      if (newAfterMessageId) {
        await tx.mergeEvent.create({
          data: {
            sourceThreadId: merge.sourceThreadId,
            targetThreadId: newThread.id,
            afterMessageId: newAfterMessageId,
            summary: merge.summary,
          },
        });
      }
    }

    return {
      conversation: {
        id: newConversation.id,
        title: newConversation.title,
        updatedAt: newConversation.updatedAt,
        createdAt: newConversation.createdAt,
      },
    };
  });

  // Fire-and-forget: refine the title with the LLM.
  if (sourceThread.highlightedText) {
    generateText({
      model: chatModel,
      prompt:
        `In 4 words or fewer, write a short title for a conversation exploring this topic: "${sourceThread.highlightedText.slice(0, 300)}". ` +
        "Reply with only the title — no quotes, no punctuation at the end.",
    })
      .then(({ text: rawTitle }) => {
        const aiTitle = rawTitle.trim().replace(/^["']|["']$/g, "").slice(0, 50);
        if (aiTitle) {
          return prisma.conversation.update({
            where: { id: result.conversation.id },
            data: { title: aiTitle },
          });
        }
      })
      .catch((err) => log.error("auto-title backfill failed", err));
  }

  return NextResponse.json(result, { status: 201 });
}
