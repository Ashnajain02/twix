import { describe, it, expect } from "vitest";
import { reconstructTangentState } from "../tangent-utils";

interface MockThread {
  id: string;
  parentThreadId: string | null;
  parentMessageId: string | null;
  highlightedText: string | null;
  depth: number;
  status: string;
}

function makeThread(overrides: Partial<MockThread>): MockThread {
  return {
    id: "t",
    parentThreadId: null,
    parentMessageId: null,
    highlightedText: null,
    depth: 0,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("reconstructTangentState", () => {
  it("returns empty when no tangents exist", () => {
    const threads = [
      makeThread({ id: "main", parentThreadId: null, depth: 0 }),
    ];
    expect(reconstructTangentState(threads, "main")).toEqual([]);
  });

  it("converts a direct child tangent and normalizes parentThreadId to 'main'", () => {
    const threads = [
      makeThread({ id: "main", parentThreadId: null, depth: 0 }),
      makeThread({
        id: "t1",
        parentThreadId: "main",
        parentMessageId: "m1",
        highlightedText: "interesting",
        depth: 1,
      }),
    ];
    const result = reconstructTangentState(threads, "main");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      threadId: "t1",
      parentThreadId: "main",
      parentMessageId: "m1",
      highlightedText: "interesting",
      depth: 1,
    });
  });

  it("preserves nested tangent parent IDs verbatim (no 'main' normalization)", () => {
    const threads = [
      makeThread({ id: "main", depth: 0 }),
      makeThread({ id: "t1", parentThreadId: "main", parentMessageId: "m1", depth: 1 }),
      makeThread({ id: "t2", parentThreadId: "t1", parentMessageId: "m2", depth: 2 }),
    ];
    const result = reconstructTangentState(threads, "main");
    const t2 = result.find((t) => t.threadId === "t2");
    expect(t2?.parentThreadId).toBe("t1");
  });

  it("filters out ARCHIVED and MERGED threads", () => {
    const threads = [
      makeThread({ id: "main", depth: 0 }),
      makeThread({ id: "t1", parentThreadId: "main", parentMessageId: "m1", depth: 1, status: "ACTIVE" }),
      makeThread({ id: "t2", parentThreadId: "main", parentMessageId: "m2", depth: 1, status: "ARCHIVED" }),
      makeThread({ id: "t3", parentThreadId: "main", parentMessageId: "m3", depth: 1, status: "MERGED" }),
    ];
    const result = reconstructTangentState(threads, "main");
    expect(result.map((t) => t.threadId)).toEqual(["t1"]);
  });

  it("drops orphaned tangents whose intermediate ancestor is gone", () => {
    // t2's parent t1 was archived → t2 has no valid chain to main
    const threads = [
      makeThread({ id: "main", depth: 0 }),
      makeThread({ id: "t1", parentThreadId: "main", parentMessageId: "m1", depth: 1, status: "ARCHIVED" }),
      makeThread({ id: "t2", parentThreadId: "t1", parentMessageId: "m2", depth: 2, status: "ACTIVE" }),
    ];
    const result = reconstructTangentState(threads, "main");
    expect(result).toEqual([]);
  });

  it("defaults null parentMessageId/highlightedText to empty strings", () => {
    const threads = [
      makeThread({ id: "main", depth: 0 }),
      makeThread({
        id: "t1",
        parentThreadId: "main",
        parentMessageId: null,
        highlightedText: null,
        depth: 1,
      }),
    ];
    const [t1] = reconstructTangentState(threads, "main");
    expect(t1.parentMessageId).toBe("");
    expect(t1.highlightedText).toBe("");
  });
});
