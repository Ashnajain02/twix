import { streamText, generateText, tool, stepCountIs, zodSchema } from "ai";
import { z } from "zod";
import { tavily } from "@tavily/core";
import { chatModel, getSystemPrompt } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { buildContextForThread } from "@/lib/context-builder";
import { prisma } from "@/lib/prisma";
import { maybeUpdateThreadSummary } from "@/lib/thread-summarizer";
import { embedMessage } from "@/lib/embeddings";

export async function POST(req: Request) {
  const requestStart = Date.now();

  // Step 1: Auth + body parsing in parallel
  const [session, body] = await Promise.all([auth(), req.json()]);
  if (!session?.user?.id) {
    console.log("[chat] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const { threadId, messages } = body;
  const authDone = Date.now();
  console.log(`[chat] Auth+parse: ${authDone - requestStart}ms | user=${session.user.id} thread=${threadId} messages=${messages.length}`);

  // Extract the latest user message from the client payload (no DB needed)
  const latestMessage = messages[messages.length - 1];
  const latestContent =
    latestMessage.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("") ||
    latestMessage.content ||
    "";

  console.log(`[chat] User message: "${latestContent.slice(0, 100)}${latestContent.length > 100 ? "..." : ""}"`);

  // Step 2: Fetch thread (with all data needed for both auth AND context building)
  //         + persist user message — in parallel. Single thread query, no duplicate.
  const [thread, userMsg] = await Promise.all([
    prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        conversation: true,
        messages: { orderBy: { createdAt: "asc" } },
        mergesAsTarget: {
          include: { sourceThread: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.message.create({
      data: { threadId, role: "USER", content: latestContent },
    }),
  ]);

  if (!thread || thread.conversation.userId !== session.user.id) {
    console.log(`[chat] Thread not found or unauthorized: ${threadId}`);
    return new Response("Not found", { status: 404 });
  }

  // Build context from already-fetched thread data — zero additional queries for depth 0
  const contextMessages = await buildContextForThread(thread, latestContent);

  // Fire-and-forget: embed the user message
  embedMessage(userMsg.id).catch((err) =>
    console.error(`[chat] User embedding failed:`, err)
  );

  const preStreamMs = Date.now() - requestStart;
  console.log(`[chat] Pre-stream: ${preStreamMs}ms | context: ${contextMessages.length} messages (depth=${thread.depth})`);

  // Tavily client — only created if API key is present
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const tavilyClient = tavilyApiKey ? tavily({ apiKey: tavilyApiKey }) : null;

  const result = streamText({
    model: chatModel,
    system: getSystemPrompt(),
    messages: [...contextMessages, { role: "user", content: latestContent }],

    tools: {
      webSearch: tool({
        description:
          "Search the web. ONLY call this if the answer requires information from after your training cutoff (e.g. today's news, live prices, recent events). NEVER call this for historical facts, science, math, coding, or anything you already know.",
        inputSchema: zodSchema(z.object({
          query: z.string().describe("A clear, concise search query"),
        })),
        execute: async ({ query }: { query: string }) => {
          if (!tavilyClient) {
            return {
              error:
                "Web search is not configured. Add TAVILY_API_KEY to your .env file.",
            };
          }
          try {
            console.log(`[tool:webSearch] query="${query}"`);
            const searchStart = Date.now();
            const response = await tavilyClient.search(query, {
              maxResults: 5,
              searchDepth: "basic",
              includeAnswer: true,
            });
            console.log(`[tool:webSearch] ${response.results.length} results in ${Date.now() - searchStart}ms`);
            return {
              answer: response.answer ?? null,
              results: response.results.slice(0, 3).map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 500),
              })),
            };
          } catch (err) {
            console.error(`[tool:webSearch] Error:`, err);
            return { error: "Search request failed" };
          }
        },
      }),
    },

    stopWhen: stepCountIs(5),

    async onFinish({ text, usage, steps }) {
      const elapsed = Date.now() - requestStart;
      const toolCalls = steps?.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0;
      console.log(
        `[chat] Completed in ${elapsed}ms | ` +
        `tokens: ${usage?.inputTokens ?? "?"}→${usage?.outputTokens ?? "?"} | ` +
        `steps: ${steps?.length ?? "?"} | tool calls: ${toolCalls} | ` +
        `response: ${text ? `${text.length} chars` : "(no text)"}`
      );

      // Persist assistant message + bump updatedAt in parallel
      const writes: Promise<unknown>[] = [
        prisma.conversation.update({
          where: { id: thread.conversationId },
          data: { updatedAt: new Date() },
        }),
      ];
      if (text) {
        writes.push(
          prisma.message.create({
            data: { threadId, role: "ASSISTANT", content: text },
          }).then((assistantMsg) => {
            // Fire-and-forget: embed the assistant message
            embedMessage(assistantMsg.id).catch((err) =>
              console.error(`[chat] Assistant embedding failed:`, err)
            );
          })
        );
      }
      await Promise.all(writes);

      // Fire-and-forget: eager summarization + knowledge distillation
      maybeUpdateThreadSummary(threadId).catch((err) =>
        console.error(`[chat] Summary/knowledge generation failed:`, err)
      );

      // Auto-title: fire-and-forget (don't block the response)
      if (thread.depth === 0 && thread.conversation.title === "New Conversation") {
        const msgCount = await prisma.message.count({ where: { threadId } });
        if (msgCount <= 3) {
          generateText({
            model: chatModel,
            prompt: `In 4 words or fewer, write a short title for a conversation that starts with this message: "${latestContent.slice(0, 300)}". Reply with only the title — no quotes, no punctuation at the end.`,
          })
            .then(({ text: rawTitle }) => {
              const title = rawTitle.trim().replace(/^["']|["']$/g, "").slice(0, 50);
              if (title) {
                console.log(`[chat] Auto-title: "${title}"`);
                return prisma.conversation.update({
                  where: { id: thread.conversationId },
                  data: { title },
                });
              }
            })
            .catch((err) => console.error(`[chat] Auto-title failed:`, err));
        }
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "Server-Timing": `prestream;dur=${preStreamMs}`,
    },
  });
}
