import { streamText, generateText, tool, stepCountIs, zodSchema } from "ai";
import { z } from "zod";
import { tavily } from "@tavily/core";
import { chatModel, getSystemPrompt } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { buildContextForThread } from "@/lib/context-builder";
import { prisma } from "@/lib/prisma";
import {
  runCommand,
  readSandboxFile,
  writeSandboxFile,
  listSandboxDir,
  startServer,
  getPreviewUrl,
  killProcess,
  getServerLogs,
} from "@/lib/e2b";

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

  // Step 2: Thread verification + context building + message persistence in parallel
  const [thread, contextMessages] = await Promise.all([
    prisma.thread.findUnique({
      where: { id: threadId },
      include: { conversation: true },
    }),
    buildContextForThread(threadId),
    // Fire-and-forget: persist user message without blocking the stream
    prisma.message.create({
      data: { threadId, role: "USER", content: latestContent },
    }),
  ]);

  if (!thread || thread.conversation.userId !== session.user.id) {
    console.log(`[chat] Thread not found or unauthorized: ${threadId}`);
    return new Response("Not found", { status: 404 });
  }

  const preStreamMs = Date.now() - requestStart;
  console.log(`[chat] Pre-stream: ${preStreamMs}ms | context: ${contextMessages.length} messages (depth=${thread.depth})`);

  // Tavily client — only created if API key is present
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const tavilyClient = tavilyApiKey ? tavily({ apiKey: tavilyApiKey }) : null;

  const conversationId = thread.conversationId;
  const hasE2B = !!process.env.E2B_API_KEY;

  const result = streamText({
    model: chatModel,
    system: getSystemPrompt(hasE2B),
    messages: [...contextMessages, { role: "user", content: latestContent }],

    // ── Web search tool ──────────────────────────────────────────────
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

      // ── Dev environment tools (require E2B_API_KEY) ────────────────
      ...(hasE2B
        ? {
            runCommand: tool({
              description:
                "Run a shell command in the cloud sandbox (e.g. git clone, npm install, pytest, ls, cat). Returns stdout, stderr, and exit code.",
              inputSchema: zodSchema(
                z.object({
                  command: z.string().describe("Shell command to execute"),
                  workingDirectory: z
                    .string()
                    .optional()
                    .describe("Working directory (default: /home/user)"),
                })
              ),
              execute: async ({
                command,
                workingDirectory,
              }: {
                command: string;
                workingDirectory?: string;
              }) => {
                console.log(`[tool:runCommand] ${command}${workingDirectory ? ` (cwd: ${workingDirectory})` : ""}`);
                try {
                  const cmdStart = Date.now();
                  const result = await runCommand(
                    conversationId,
                    command,
                    workingDirectory
                  );
                  console.log(`[tool:runCommand] exit=${result.exitCode} in ${Date.now() - cmdStart}ms`);
                  return result;
                } catch (err: unknown) {
                  console.error(`[tool:runCommand] Error:`, err);
                  return {
                    stdout: "",
                    stderr:
                      err instanceof Error ? err.message : "Command failed",
                    exitCode: 1,
                  };
                }
              },
            }),

            readFile: tool({
              description:
                "Read a file's contents from the cloud sandbox filesystem.",
              inputSchema: zodSchema(
                z.object({
                  path: z
                    .string()
                    .describe("Absolute path to the file in the sandbox"),
                })
              ),
              execute: async ({ path }: { path: string }) => {
                console.log(`[tool:readFile] ${path}`);
                try {
                  const content = await readSandboxFile(conversationId, path);
                  console.log(`[tool:readFile] ${content.length} chars`);
                  return { content };
                } catch (err: unknown) {
                  console.error(`[tool:readFile] Error reading ${path}:`, err);
                  return {
                    error:
                      err instanceof Error ? err.message : "Failed to read file",
                  };
                }
              },
            }),

            writeFile: tool({
              description:
                "Write content to a file in the cloud sandbox. Creates the file and any needed directories if they don't exist.",
              inputSchema: zodSchema(
                z.object({
                  path: z
                    .string()
                    .describe("Absolute path to the file in the sandbox"),
                  content: z.string().describe("File content to write"),
                })
              ),
              execute: async ({
                path,
                content,
              }: {
                path: string;
                content: string;
              }) => {
                console.log(`[tool:writeFile] ${path} (${content.length} chars)`);
                try {
                  await writeSandboxFile(conversationId, path, content);
                  return { success: true, path };
                } catch (err: unknown) {
                  console.error(`[tool:writeFile] Error writing ${path}:`, err);
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to write file",
                  };
                }
              },
            }),

            listDir: tool({
              description:
                "List files and directories at the given path in the cloud sandbox.",
              inputSchema: zodSchema(
                z.object({
                  path: z
                    .string()
                    .describe(
                      "Directory path to list (default: /home/user)"
                    ),
                })
              ),
              execute: async ({ path }: { path: string }) => {
                console.log(`[tool:listDir] ${path || "/home/user"}`);
                try {
                  const entries = await listSandboxDir(
                    conversationId,
                    path || "/home/user"
                  );
                  console.log(`[tool:listDir] ${entries.length} entries`);
                  return { entries };
                } catch (err: unknown) {
                  console.error(`[tool:listDir] Error:`, err);
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to list directory",
                  };
                }
              },
            }),

            startServer: tool({
              description:
                "Start a dev server in the background and get a live preview URL. Returns { url, pid, logs, listening }. Check the 'listening' field — if false, the server failed to start; read 'logs' to diagnose and fix the issue. If a server is already running on the same port, kill it first with killProcess. IMPORTANT: Only include the URL as a markdown link if listening=true.",
              inputSchema: zodSchema(
                z.object({
                  command: z
                    .string()
                    .describe(
                      "Server startup command (e.g. npm run dev, python -m http.server 8080)"
                    ),
                  port: z
                    .number()
                    .optional()
                    .describe("Port the server listens on (default: 3000)"),
                  workingDirectory: z
                    .string()
                    .optional()
                    .describe("Working directory (default: /home/user)"),
                })
              ),
              execute: async ({
                command,
                port,
                workingDirectory,
              }: {
                command: string;
                port?: number;
                workingDirectory?: string;
              }) => {
                const p = port ?? 3000;
                console.log(`[tool:startServer] "${command}" on port ${p}${workingDirectory ? ` (cwd: ${workingDirectory})` : ""}`);
                try {
                  const result = await startServer(
                    conversationId,
                    command,
                    p,
                    workingDirectory
                  );
                  console.log(`[tool:startServer] pid=${result.pid} listening=${result.listening} url=${result.url}`);
                  return result;
                } catch (err: unknown) {
                  console.error(`[tool:startServer] Error:`, err);
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to start server",
                  };
                }
              },
            }),

            getPreviewUrl: tool({
              description:
                "Get the public URL for a port already running in the sandbox. Use when you need to re-share the preview URL without starting a new server.",
              inputSchema: zodSchema(
                z.object({
                  port: z
                    .number()
                    .describe("Port number of the running server"),
                })
              ),
              execute: async ({ port }: { port: number }) => {
                try {
                  const url = await getPreviewUrl(conversationId, port);
                  return { url };
                } catch (err: unknown) {
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to get preview URL",
                  };
                }
              },
            }),

            getServerLogs: tool({
              description:
                "Read the captured stdout/stderr logs for a background server process. Use this to diagnose why a server failed to start or is misbehaving. Returns { logs, running }.",
              inputSchema: zodSchema(
                z.object({
                  pid: z
                    .number()
                    .describe("Process ID returned by startServer"),
                })
              ),
              execute: async ({ pid }: { pid: number }) => {
                try {
                  return await getServerLogs(conversationId, pid);
                } catch (err: unknown) {
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to get server logs",
                  };
                }
              },
            }),

            killProcess: tool({
              description:
                "Kill a running background process by PID. Use before restarting a server on the same port.",
              inputSchema: zodSchema(
                z.object({
                  pid: z
                    .number()
                    .describe("Process ID returned by startServer"),
                })
              ),
              execute: async ({ pid }: { pid: number }) => {
                try {
                  const killed = await killProcess(conversationId, pid);
                  return { success: killed };
                } catch (err: unknown) {
                  return {
                    error:
                      err instanceof Error
                        ? err.message
                        : "Failed to kill process",
                  };
                }
              },
            }),
          }
        : {}),
    },

    // Limit tool steps: 5 for sandbox workflows, keeps responses snappy
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
          })
        );
      }
      await Promise.all(writes);

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
