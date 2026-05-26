import { streamText, generateText, tool, stepCountIs, zodSchema } from "ai";
import { z } from "zod";
import { tavily } from "@tavily/core";
import { chatModel, getSystemPrompt } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { buildContextForThread } from "@/lib/context-builder";
import { prisma } from "@/lib/prisma";
import { maybeUpdateThreadSummary } from "@/lib/thread-summarizer";
import { embedMessage } from "@/lib/embeddings";
import { chatRequestSchema } from "@/lib/validators";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, tooManyRequests, unauthorized } from "@/lib/http";
import { createRateLimit } from "@/lib/rate-limit";

const log = createLogger("chat");

// 20 requests / minute per user — generous for a chat UI, tight enough to
// stop a runaway client from burning OpenAI/Tavily credits.
const limiter = createRateLimit({ max: 20, windowMs: 60_000 });

// Tavily web-search client. Hoisted to module scope so we reuse one client
// across requests rather than rebuilding on every invocation.
const tavilyClient = process.env.TAVILY_API_KEY
  ? tavily({ apiKey: process.env.TAVILY_API_KEY })
  : null;

const webSearchTool = tool({
  description:
    "Search the web. ONLY call this if the answer requires information from after your training cutoff (e.g. today's news, live prices, recent events). NEVER call this for historical facts, science, math, coding, or anything you already know.",
  inputSchema: zodSchema(
    z.object({ query: z.string().describe("A clear, concise search query") })
  ),
  execute: async ({ query }: { query: string }) => {
    if (!tavilyClient) {
      return {
        error:
          "Web search is not configured. Add TAVILY_API_KEY to your .env file.",
      };
    }
    try {
      const start = Date.now();
      const response = await tavilyClient.search(query, {
        maxResults: 5,
        searchDepth: "basic",
        includeAnswer: true,
      });
      log.debug("web search", {
        ms: Date.now() - start,
        results: response.results.length,
      });
      return {
        answer: response.answer ?? null,
        results: response.results.slice(0, 3).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 500),
        })),
      };
    } catch (err) {
      log.error("web search failed", err);
      return { error: "Search request failed" };
    }
  },
});

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

export async function POST(req: Request) {
  const start = Date.now();

  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const rl = limiter.check(`u:${session.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  // Parse + validate body before touching the DB.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    log.warn("invalid request body", { issues: parsed.error.issues.length });
    return badRequest("Invalid request body");
  }
  const { threadId, messages } = parsed.data;

  const latestMessage = messages[messages.length - 1];
  const latestContent = extractText(latestMessage.parts);
  if (!latestContent) return badRequest("Empty message");

  // Verify thread ownership BEFORE persisting anything. Loads thread data we
  // also need for context building, so this is the one query we'd do anyway.
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      conversation: { select: { userId: true, title: true } },
      messages: { orderBy: { createdAt: "asc" } },
      mergesAsTarget: {
        include: { sourceThread: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread || thread.conversation.userId !== session.user.id) {
    return notFound();
  }

  // Auth verified. Persist user message + build context in parallel.
  const [userMsg, contextMessages] = await Promise.all([
    prisma.message.create({
      data: { threadId, role: "USER", content: latestContent },
    }),
    buildContextForThread(thread, latestContent),
  ]);

  embedMessage(userMsg.id).catch((err) =>
    log.error("user embedding failed", err)
  );

  const preStreamMs = Date.now() - start;
  log.info("pre-stream", {
    ms: preStreamMs,
    context: contextMessages.length,
    depth: thread.depth,
  });

  // Snapshot the data we need in onFinish so the closure doesn't hold
  // the entire thread record (including all messages).
  const { conversationId } = thread;
  const isFirstTurn =
    thread.depth === 0 &&
    thread.conversation.title === "New Conversation" &&
    thread.messages.length === 0;

  const result = streamText({
    model: chatModel,
    system: getSystemPrompt(),
    messages: [...contextMessages, { role: "user", content: latestContent }],
    tools: { webSearch: webSearchTool },
    stopWhen: stepCountIs(5),

    async onFinish({ text, usage, steps }) {
      const elapsed = Date.now() - start;
      const toolCalls =
        steps?.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0;
      log.info("completed", {
        ms: elapsed,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        steps: steps?.length ?? null,
        toolCalls,
        chars: text?.length ?? 0,
      });

      const writes: Promise<unknown>[] = [
        prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ];
      if (text) {
        writes.push(
          prisma.message
            .create({ data: { threadId, role: "ASSISTANT", content: text } })
            .then((assistantMsg) =>
              embedMessage(assistantMsg.id).catch((err) =>
                log.error("assistant embedding failed", err)
              )
            )
        );
      }
      await Promise.all(writes);

      maybeUpdateThreadSummary(threadId).catch((err) =>
        log.error("summary/knowledge generation failed", err)
      );

      // Auto-title only on the very first turn of a brand-new conversation.
      if (isFirstTurn) {
        try {
          const { text: rawTitle } = await generateText({
            model: chatModel,
            prompt:
              `In 4 words or fewer, write a short title for a conversation that starts with this message: "${latestContent.slice(0, 300)}". ` +
              "Reply with only the title — no quotes, no punctuation at the end.",
          });
          const title = rawTitle
            .trim()
            .replace(/^["']|["']$/g, "")
            .slice(0, 50);
          if (title) {
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { title },
            });
            log.info("auto-titled", { titleLen: title.length });
          }
        } catch (err) {
          log.error("auto-title failed", err);
        }
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "Server-Timing": `prestream;dur=${preStreamMs}` },
  });
}
