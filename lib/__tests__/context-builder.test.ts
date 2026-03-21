import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    thread: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
  },
}));

import { buildContextForThread } from "../context-builder";
import { prisma } from "@/lib/prisma";

const mockThread = prisma.thread.findUnique as ReturnType<typeof vi.fn>;
const mockMessages = prisma.message.findMany as ReturnType<typeof vi.fn>;

describe("buildContextForThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds context for a main thread (no parent)", async () => {
    mockThread.mockResolvedValue({
      id: "thread-1",
      parentThreadId: null,
      parentMessageId: null,
      highlightedText: null,
      messages: [
        { id: "m1", role: "USER", content: "Hello" },
        { id: "m2", role: "ASSISTANT", content: "Hi there!" },
      ],
      mergesAsTarget: [],
    });

    const context = await buildContextForThread("thread-1");

    expect(context).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
    // Should NOT query parent messages for a main thread
    expect(mockMessages).not.toHaveBeenCalled();
  });

  it("builds context for a tangent thread with parent messages", async () => {
    mockThread.mockResolvedValue({
      id: "tangent-1",
      parentThreadId: "thread-1",
      parentMessageId: "m2",
      highlightedText: "interesting topic",
      messages: [
        { id: "t1", role: "USER", content: "Tell me more" },
        { id: "t2", role: "ASSISTANT", content: "Sure, here's more info" },
      ],
      mergesAsTarget: [],
    });

    mockMessages.mockResolvedValue([
      { id: "m1", role: "USER", content: "Hello" },
      { id: "m2", role: "ASSISTANT", content: "Hi there!" },
      { id: "m3", role: "USER", content: "This should be excluded" },
    ]);

    const context = await buildContextForThread("tangent-1");

    // Should include parent messages up to and including parentMessageId
    expect(context[0]).toEqual({ role: "user", content: "Hello" });
    expect(context[1]).toEqual({ role: "assistant", content: "Hi there!" });
    // Should include system message about highlighted text
    expect(context[2].role).toBe("system");
    expect(context[2].content).toContain("interesting topic");
    // Should include tangent's own messages
    expect(context[3]).toEqual({ role: "user", content: "Tell me more" });
    expect(context[4]).toEqual({ role: "assistant", content: "Sure, here's more info" });
    // Should NOT include messages after parentMessageId
    expect(context.find((m) => m.content === "This should be excluded")).toBeUndefined();
  });

  it("includes merged tangent context after the correct message", async () => {
    mockThread.mockResolvedValue({
      id: "thread-1",
      parentThreadId: null,
      parentMessageId: null,
      highlightedText: null,
      messages: [
        { id: "m1", role: "USER", content: "Hello" },
        { id: "m2", role: "ASSISTANT", content: "Hi!" },
        { id: "m3", role: "USER", content: "Follow up" },
      ],
      mergesAsTarget: [
        {
          afterMessageId: "m2",
          summary: "Explored side topic",
          sourceThread: {
            messages: [
              { role: "USER", content: "Side question" },
              { role: "ASSISTANT", content: "Side answer" },
            ],
          },
          createdAt: new Date(),
        },
      ],
    });

    const context = await buildContextForThread("thread-1");

    // m1, m2, then merged context, then m3
    expect(context[0]).toEqual({ role: "user", content: "Hello" });
    expect(context[1]).toEqual({ role: "assistant", content: "Hi!" });
    // Merged summary
    expect(context[2].role).toBe("system");
    expect(context[2].content).toContain("Explored side topic");
    // Merged messages
    expect(context[3]).toEqual({ role: "user", content: "Side question" });
    expect(context[4]).toEqual({ role: "assistant", content: "Side answer" });
    // End of merged context
    expect(context[5].role).toBe("system");
    expect(context[5].content).toContain("End of merged");
    // Original thread continues
    expect(context[6]).toEqual({ role: "user", content: "Follow up" });
  });

  it("throws for non-existent thread", async () => {
    mockThread.mockResolvedValue(null);

    await expect(buildContextForThread("nonexistent")).rejects.toThrow(
      "Thread nonexistent not found"
    );
  });

  describe("performance", () => {
    it("builds main thread context within 50ms (mocked DB)", async () => {
      // Simulate a thread with many messages
      const messages = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Message ${i} with some content that has a reasonable length to simulate real messages.`,
      }));

      mockThread.mockResolvedValue({
        id: "thread-perf",
        parentThreadId: null,
        parentMessageId: null,
        highlightedText: null,
        messages,
        mergesAsTarget: [],
      });

      const start = performance.now();
      const context = await buildContextForThread("thread-perf");
      const elapsed = performance.now() - start;

      expect(context).toHaveLength(50);
      expect(elapsed).toBeLessThan(50); // Should be near-instant with mocked DB
      console.log(`[perf] Main thread context (50 msgs): ${elapsed.toFixed(2)}ms`);
    });

    it("builds tangent context within 50ms (mocked DB)", async () => {
      const parentMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `pm${i}`,
        role: i % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Parent message ${i}`,
      }));

      mockThread.mockResolvedValue({
        id: "tangent-perf",
        parentThreadId: "parent-thread",
        parentMessageId: "pm10",
        highlightedText: "highlighted text for tangent",
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: `tm${i}`,
          role: i % 2 === 0 ? "USER" : "ASSISTANT",
          content: `Tangent message ${i}`,
        })),
        mergesAsTarget: [],
      });

      mockMessages.mockResolvedValue(parentMessages);

      const start = performance.now();
      const context = await buildContextForThread("tangent-perf");
      const elapsed = performance.now() - start;

      // 11 parent messages (up to pm10) + 1 system + 10 tangent = 22
      expect(context).toHaveLength(22);
      expect(elapsed).toBeLessThan(50);
      console.log(`[perf] Tangent context (20 parent + 10 own): ${elapsed.toFixed(2)}ms`);
    });
  });
});
