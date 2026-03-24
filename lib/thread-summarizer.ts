import { generateText } from "ai";
import { chatModel } from "./ai";
import { prisma } from "./prisma";

/**
 * Threshold: regenerate the thread summary after this many new messages
 * since the last summary was generated.
 */
const SUMMARY_THRESHOLD = 20;

/**
 * Checks whether a thread's summary is stale and regenerates it if needed.
 * Called after each assistant response (fire-and-forget).
 *
 * A summary is considered stale when the thread has accumulated
 * SUMMARY_THRESHOLD more messages since the last summary was generated.
 */
export async function maybeUpdateThreadSummary(
  threadId: string
): Promise<void> {
  const messageCount = await prisma.message.count({
    where: { threadId },
  });

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { summaryMessageCount: true },
  });

  if (!thread) return;

  const newMessagesSinceSummary = messageCount - thread.summaryMessageCount;

  // Don't summarize very short threads, and only regenerate
  // when enough new messages have accumulated
  if (messageCount < SUMMARY_THRESHOLD || newMessagesSinceSummary < SUMMARY_THRESHOLD) {
    return;
  }

  console.log(
    `[summarizer] Thread ${threadId}: ${messageCount} messages, ` +
    `last summary covered ${thread.summaryMessageCount}. Regenerating...`
  );

  const messages = await prisma.message.findMany({
    where: { threadId, role: { not: "SYSTEM" } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // Build a condensed transcript (truncate individual messages to limit input)
  const transcript = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const { text } = await generateText({
    model: chatModel,
    prompt:
      `Summarize the following conversation into a single paragraph (3-5 sentences). ` +
      `Capture the key topics discussed, important conclusions reached, and any decisions made. ` +
      `Write in third person (e.g. "The user asked about..." / "The assistant explained..."). ` +
      `Be specific — include names, numbers, and technical details rather than vague references.\n\n` +
      transcript,
  });

  await prisma.thread.update({
    where: { id: threadId },
    data: {
      summary: text.trim(),
      summaryMessageCount: messageCount,
    },
  });

  console.log(
    `[summarizer] Thread ${threadId}: summary updated (${text.trim().length} chars, covers ${messageCount} messages)`
  );
}
