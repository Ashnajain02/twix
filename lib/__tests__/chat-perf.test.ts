import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Performance tests for the chat API route's pre-stream pipeline.
 *
 * These tests mock the AI SDK and database to measure the overhead
 * of auth, context building, and message persistence — i.e. everything
 * that happens BEFORE the first streaming byte reaches the client.
 *
 * Target: pre-stream overhead < 200ms (the rest is OpenAI TTFB, which we can't control).
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    thread: {
      findUnique: vi.fn(),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "new-msg" }),
      count: vi.fn().mockResolvedValue(1),
    },
    conversation: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock context builder
vi.mock("@/lib/context-builder", () => ({
  buildContextForThread: vi.fn().mockResolvedValue([
    { role: "user", content: "Previous message" },
    { role: "assistant", content: "Previous response" },
  ]),
}));

// Mock AI SDK — capture when streamText is called (= pre-stream phase complete)
let streamTextCalledAt: number | null = null;
vi.mock("ai", () => ({
  streamText: vi.fn((...args: unknown[]) => {
    streamTextCalledAt = performance.now();
    return {
      toUIMessageStreamResponse: () =>
        new Response("streaming...", {
          headers: { "Content-Type": "text/event-stream" },
        }),
    };
  }),
  generateText: vi.fn().mockResolvedValue({ text: "Test Title" }),
  tool: vi.fn((config: unknown) => config),
  stepCountIs: vi.fn(() => () => false),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

// Mock e2b (not relevant for timing but needed for imports)
vi.mock("@/lib/e2b", () => ({
  runCommand: vi.fn(),
  readSandboxFile: vi.fn(),
  writeSandboxFile: vi.fn(),
  listSandboxDir: vi.fn(),
  startServer: vi.fn(),
  getPreviewUrl: vi.fn(),
  killProcess: vi.fn(),
  getServerLogs: vi.fn(),
}));

// Mock tavily
vi.mock("@tavily/core", () => ({
  tavily: vi.fn(() => ({ search: vi.fn() })),
}));

import { prisma } from "@/lib/prisma";

const mockThreadFind = prisma.thread.findUnique as ReturnType<typeof vi.fn>;

describe("Chat API Pre-Stream Performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextCalledAt = null;

    mockThreadFind.mockResolvedValue({
      id: "thread-1",
      conversationId: "conv-1",
      depth: 0,
      conversation: {
        id: "conv-1",
        userId: "user-1",
        title: "New Conversation",
      },
    });
  });

  it("measures pre-stream overhead (auth + DB + context building)", async () => {
    // Dynamically import the route handler
    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "Hello, how are you?" }],
          },
        ],
      }),
    });

    const startTime = performance.now();
    const response = await POST(request);
    const totalTime = performance.now() - startTime;

    expect(response.status).toBe(200);

    // With mocked DB, the pre-stream phase should be very fast
    const preStreamTime = streamTextCalledAt
      ? streamTextCalledAt - startTime
      : totalTime;

    console.log(`
╔══════════════════════════════════════════╗
║     Chat API Performance Metrics         ║
╠══════════════════════════════════════════╣
║ Pre-stream overhead:  ${preStreamTime.toFixed(2).padStart(8)}ms       ║
║ Total route time:     ${totalTime.toFixed(2).padStart(8)}ms       ║
║ Stream start called:  ${streamTextCalledAt ? "YES" : "NO "}             ║
╚══════════════════════════════════════════╝
    `);

    // Pre-stream should be < 100ms with mocked dependencies
    // In production with real DB, target is < 200ms
    expect(preStreamTime).toBeLessThan(100);
  });

  it("handles concurrent requests efficiently", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const makeRequest = () =>
      new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "thread-1",
          messages: [
            {
              id: "msg-1",
              role: "user",
              parts: [{ type: "text", text: "Concurrent test" }],
            },
          ],
        }),
      });

    const concurrency = 5;
    const startTime = performance.now();
    const responses = await Promise.all(
      Array.from({ length: concurrency }, () => POST(makeRequest()))
    );
    const totalTime = performance.now() - startTime;

    responses.forEach((r) => expect(r.status).toBe(200));

    const avgTime = totalTime / concurrency;
    console.log(`
╔══════════════════════════════════════════╗
║   Concurrent Request Performance         ║
╠══════════════════════════════════════════╣
║ Concurrent requests:  ${String(concurrency).padStart(8)}          ║
║ Total wall time:      ${totalTime.toFixed(2).padStart(8)}ms       ║
║ Avg per request:      ${avgTime.toFixed(2).padStart(8)}ms       ║
╚══════════════════════════════════════════╝
    `);

    // Concurrent requests should not degrade linearly
    expect(avgTime).toBeLessThan(100);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/chat/route");
    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    });

    const start = performance.now();
    const response = await POST(request);
    const elapsed = performance.now() - start;

    expect(response.status).toBe(401);
    console.log(`[perf] Auth rejection: ${elapsed.toFixed(2)}ms`);
    // Auth rejection should be nearly instant
    expect(elapsed).toBeLessThan(50);
  });

  it("returns 404 for unauthorized thread access", async () => {
    mockThreadFind.mockResolvedValueOnce({
      id: "thread-1",
      conversationId: "conv-1",
      depth: 0,
      conversation: { id: "conv-1", userId: "other-user", title: "Not yours" },
    });

    const { POST } = await import("@/app/api/chat/route");
    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    });

    const start = performance.now();
    const response = await POST(request);
    const elapsed = performance.now() - start;

    expect(response.status).toBe(404);
    console.log(`[perf] Thread auth rejection: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
  });
});
