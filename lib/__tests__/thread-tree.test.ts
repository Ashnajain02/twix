import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    thread: {
      findMany: vi.fn(),
    },
  },
}));

import { collectActiveDescendants } from "../thread-tree";
import { prisma } from "@/lib/prisma";

const findMany = prisma.thread.findMany as ReturnType<typeof vi.fn>;

describe("collectActiveDescendants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when the root has no children", async () => {
    findMany.mockResolvedValue([{ id: "root", parentThreadId: null }]);
    const result = await collectActiveDescendants("c1", "root");
    expect(result).toEqual([]);
  });

  it("collects direct children", async () => {
    findMany.mockResolvedValue([
      { id: "root", parentThreadId: null },
      { id: "child-a", parentThreadId: "root" },
      { id: "child-b", parentThreadId: "root" },
    ]);
    const result = await collectActiveDescendants("c1", "root");
    expect(result.sort()).toEqual(["child-a", "child-b"]);
  });

  it("collects deeply nested descendants in BFS order", async () => {
    findMany.mockResolvedValue([
      { id: "root", parentThreadId: null },
      { id: "a", parentThreadId: "root" },
      { id: "b", parentThreadId: "root" },
      { id: "a1", parentThreadId: "a" },
      { id: "a2", parentThreadId: "a" },
      { id: "a1a", parentThreadId: "a1" },
    ]);
    const result = await collectActiveDescendants("c1", "root");
    // BFS: a, b at depth 1; then a's children at depth 2; then deeper.
    expect(result.slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(result.slice(2, 4).sort()).toEqual(["a1", "a2"]);
    expect(result.slice(4)).toEqual(["a1a"]);
  });

  it("queries only ACTIVE threads in the given conversation", async () => {
    findMany.mockResolvedValue([{ id: "root", parentThreadId: null }]);
    await collectActiveDescendants("conv-7", "root");
    expect(findMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-7", status: "ACTIVE" },
      select: { id: true, parentThreadId: true },
    });
  });

  it("excludes the root from the returned descendants", async () => {
    findMany.mockResolvedValue([
      { id: "root", parentThreadId: null },
      { id: "child", parentThreadId: "root" },
    ]);
    const result = await collectActiveDescendants("c1", "root");
    expect(result).not.toContain("root");
    expect(result).toContain("child");
  });

  it("does not loop on a cyclic parent reference", async () => {
    // Pathological data: a is parented to b, b is parented to a.
    // The schema enforces a DAG so this shouldn't happen, but the BFS
    // must terminate regardless. Each node should appear at most once.
    findMany.mockResolvedValue([
      { id: "a", parentThreadId: "b" },
      { id: "b", parentThreadId: "a" },
    ]);
    const result = await collectActiveDescendants("c1", "a");
    expect(result).toEqual(["b"]);
  });
});
