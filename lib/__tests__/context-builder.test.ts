import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    message: {
      findMany: vi.fn(),
    },
  },
}));

// Mock embeddings — not relevant for context builder unit tests
vi.mock("@/lib/embeddings", () => ({
  findRelevantAncestorMessages: vi.fn().mockResolvedValue([]),
}));

import { buildContextForThread } from "../context-builder";
import { prisma } from "@/lib/prisma";

const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockMessages = prisma.message.findMany as ReturnType<typeof vi.fn>;

// Helper to build a thread object matching the expected input shape
function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread-1",
    parentThreadId: null,
    parentMessageId: null,
    highlightedText: null,
    messages: [] as Array<{ id: string; role: string; content: string }>,
    mergesAsTarget: [] as Array<{
      afterMessageId: string;
      summary: string | null;
      sourceThread: { knowledge: unknown; summary: string | null };
    }>,
    ...overrides,
  };
}

describe("buildContextForThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds context for a main thread (no parent)", async () => {
    const thread = makeThread({
      messages: [
        { id: "m1", role: "USER", content: "Hello" },
        { id: "m2", role: "ASSISTANT", content: "Hi there!" },
      ],
    });

    const context = await buildContextForThread(thread);

    expect(context).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
    // No DB calls needed for main thread
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockMessages).not.toHaveBeenCalled();
  });

  it("builds context for a tangent thread with parent messages", async () => {
    const thread = makeThread({
      id: "tangent-1",
      parentThreadId: "thread-1",
      parentMessageId: "m2",
      highlightedText: "interesting topic",
      messages: [
        { id: "t1", role: "USER", content: "Tell me more" },
        { id: "t2", role: "ASSISTANT", content: "Sure, here's more info" },
      ],
    });

    // Mock ancestor chain query — just the parent, no grandparents
    mockQueryRaw.mockResolvedValue([
      {
        id: "thread-1",
        parentThreadId: null,
        parentMessageId: null,
        highlightedText: null,
        summary: null,
        knowledge: null,
        depth: 0,
      },
    ]);

    mockMessages.mockResolvedValue([
      { id: "m1", role: "USER", content: "Hello" },
      { id: "m2", role: "ASSISTANT", content: "Hi there!" },
      { id: "m3", role: "USER", content: "This should be excluded" },
    ]);

    const context = await buildContextForThread(thread);

    // Parent messages up to and including parentMessageId
    expect(context[0]).toEqual({ role: "user", content: "Hello" });
    expect(context[1]).toEqual({ role: "assistant", content: "Hi there!" });
    // System message about highlighted text
    expect(context[2].role).toBe("system");
    expect(context[2].content).toContain("interesting topic");
    // Tangent's own messages
    expect(context[3]).toEqual({ role: "user", content: "Tell me more" });
    expect(context[4]).toEqual({
      role: "assistant",
      content: "Sure, here's more info",
    });
    // Messages after parentMessageId excluded
    expect(
      context.find((m) => m.content === "This should be excluded")
    ).toBeUndefined();
  });

  it("includes merged tangent context after the correct message", async () => {
    const thread = makeThread({
      messages: [
        { id: "m1", role: "USER", content: "Hello" },
        { id: "m2", role: "ASSISTANT", content: "Hi!" },
        { id: "m3", role: "USER", content: "Follow up" },
      ],
      mergesAsTarget: [
        {
          afterMessageId: "m2",
          summary: "Explored side topic",
          sourceThread: { knowledge: null, summary: null },
        },
      ],
    });

    const context = await buildContextForThread(thread);

    // m1, m2, then merged summary, end marker, then m3
    expect(context[0]).toEqual({ role: "user", content: "Hello" });
    expect(context[1]).toEqual({ role: "assistant", content: "Hi!" });
    expect(context[2].role).toBe("system");
    expect(context[2].content).toContain("Explored side topic");
    expect(context[3].role).toBe("system");
    expect(context[3].content).toContain("End of merged");
    expect(context[4]).toEqual({ role: "user", content: "Follow up" });
  });

  describe("performance", () => {
    it("builds main thread context within 5ms (no DB calls)", async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Message ${i} with some content that has a reasonable length.`,
      }));

      const thread = makeThread({ messages });

      const start = performance.now();
      const context = await buildContextForThread(thread);
      const elapsed = performance.now() - start;

      expect(context).toHaveLength(50);
      expect(elapsed).toBeLessThan(5);
      console.log(
        `[perf] Main thread context (50 msgs): ${elapsed.toFixed(2)}ms`
      );
    });

    it("builds tangent context within 50ms (mocked DB)", async () => {
      const parentMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `pm${i}`,
        role: i % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Parent message ${i}`,
      }));

      const thread = makeThread({
        id: "tangent-perf",
        parentThreadId: "parent-thread",
        parentMessageId: "pm10",
        highlightedText: "highlighted text for tangent",
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: `tm${i}`,
          role: i % 2 === 0 ? "USER" : "ASSISTANT",
          content: `Tangent message ${i}`,
        })),
      });

      mockQueryRaw.mockResolvedValue([
        {
          id: "parent-thread",
          parentThreadId: null,
          parentMessageId: null,
          highlightedText: null,
          summary: null,
          knowledge: null,
          depth: 0,
        },
      ]);
      mockMessages.mockResolvedValue(parentMessages);

      const start = performance.now();
      const context = await buildContextForThread(thread);
      const elapsed = performance.now() - start;

      // 11 parent messages (up to pm10) + 1 system + 10 tangent = 22
      expect(context).toHaveLength(22);
      expect(elapsed).toBeLessThan(50);
      console.log(
        `[perf] Tangent context (20 parent + 10 own): ${elapsed.toFixed(2)}ms`
      );
    });
  });
});
