import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the conversation-level routes:
 *   GET    /api/conversations
 *   POST   /api/conversations
 *   PATCH  /api/conversations/[conversationId]
 *
 * Uses the same mock pattern as chat-perf.test.ts — Prisma + auth are
 * mocked at the module boundary so the route logic runs unchanged.
 */

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.conversation.findMany as ReturnType<typeof vi.fn>;
const mockCreate = prisma.conversation.create as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.conversation.findUnique as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.conversation.updateMany as ReturnType<typeof vi.fn>;

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(conversationId: string) {
  return { params: Promise.resolve({ conversationId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/conversations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's conversations", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockFindMany.mockResolvedValue([
      { id: "c1", title: "first", updatedAt: new Date(), createdAt: new Date() },
    ]);
    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });
});

describe("POST /api/conversations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(jsonRequest("http://x/api/conversations", "POST", {}));
    expect(res.status).toBe(401);
  });

  it("creates a conversation with default title", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockResolvedValue({
      id: "c1",
      title: "New Conversation",
      threads: [{ id: "t1", depth: 0, status: "ACTIVE" }],
    });
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(jsonRequest("http://x/api/conversations", "POST", {}));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversation.title).toBe("New Conversation");
    expect(body.mainThread.id).toBe("t1");
  });

  it("accepts a custom title", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockResolvedValue({
      id: "c1",
      title: "Trip planning",
      threads: [{ id: "t1" }],
    });
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(
      jsonRequest("http://x/api/conversations", "POST", { title: "Trip planning" })
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Trip planning" }),
      })
    );
  });
});

describe("PATCH /api/conversations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { PATCH } = await import(
      "@/app/api/conversations/[conversationId]/route"
    );
    const res = await PATCH(
      jsonRequest("http://x/api/conversations/c1", "PATCH", { title: "x" }),
      params("c1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (empty title)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const { PATCH } = await import(
      "@/app/api/conversations/[conversationId]/route"
    );
    const res = await PATCH(
      jsonRequest("http://x/api/conversations/c1", "PATCH", { title: "" }),
      params("c1")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the conversation isn't owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockUpdateMany.mockResolvedValue({ count: 0 }); // no row matched (other user's id)
    const { PATCH } = await import(
      "@/app/api/conversations/[conversationId]/route"
    );
    const res = await PATCH(
      jsonRequest("http://x/api/conversations/c1", "PATCH", { title: "ok" }),
      params("c1")
    );
    expect(res.status).toBe(404);
  });

  it("updates the title when the caller owns the conversation", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({ id: "c1", title: "renamed", userId: "u1" });
    const { PATCH } = await import(
      "@/app/api/conversations/[conversationId]/route"
    );
    const res = await PATCH(
      jsonRequest("http://x/api/conversations/c1", "PATCH", { title: "renamed" }),
      params("c1")
    );
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
      data: { title: "renamed" },
    });
  });
});
