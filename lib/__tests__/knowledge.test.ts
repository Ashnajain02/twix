import { describe, it, expect } from "vitest";
import {
  formatKnowledgeForContext,
  threadKnowledgeSchema,
  type ThreadKnowledge,
} from "../knowledge";

const FULL: ThreadKnowledge = {
  topics: ["RSA encryption", "key rotation"],
  facts: ["Uses primes p, q", "n = p × q"],
  decisions: ["Use 2048-bit keys"],
  openQuestions: ["How often to rotate?"],
  preferences: ["Wants code examples"],
  entities: { OpenSSL: "library for crypto" },
};

describe("formatKnowledgeForContext", () => {
  it("includes the label in the header", () => {
    const out = formatKnowledgeForContext(FULL, "parent thread");
    expect(out).toContain("[Thread Knowledge — parent thread:");
  });

  it("renders every populated category on its own line", () => {
    const out = formatKnowledgeForContext(FULL, "x");
    expect(out).toMatch(/Topics: RSA encryption, key rotation/);
    expect(out).toMatch(/Facts: Uses primes p, q \| n = p × q/);
    expect(out).toMatch(/Decisions: Use 2048-bit keys/);
    expect(out).toMatch(/Open Questions: How often to rotate\?/);
    expect(out).toMatch(/User Preferences: Wants code examples/);
    expect(out).toMatch(/Entities: OpenSSL: library for crypto/);
  });

  it("omits empty categories rather than emitting blank labels", () => {
    const sparse: ThreadKnowledge = {
      topics: ["only-topic"],
      facts: [],
      decisions: [],
      openQuestions: [],
      preferences: [],
      entities: {},
    };
    const out = formatKnowledgeForContext(sparse, "x");
    expect(out).toContain("Topics: only-topic");
    expect(out).not.toMatch(/Facts:/);
    expect(out).not.toMatch(/Decisions:/);
    expect(out).not.toMatch(/Open Questions:/);
    expect(out).not.toMatch(/User Preferences:/);
    expect(out).not.toMatch(/Entities:/);
  });
});

describe("threadKnowledgeSchema", () => {
  it("accepts a fully-populated object", () => {
    expect(threadKnowledgeSchema.safeParse(FULL).success).toBe(true);
  });

  it("accepts empty arrays for every list category", () => {
    const empty: ThreadKnowledge = {
      topics: [],
      facts: [],
      decisions: [],
      openQuestions: [],
      preferences: [],
      entities: {},
    };
    expect(threadKnowledgeSchema.safeParse(empty).success).toBe(true);
  });

  it("rejects unknown top-level shape", () => {
    expect(threadKnowledgeSchema.safeParse(null).success).toBe(false);
    expect(threadKnowledgeSchema.safeParse("not an object").success).toBe(false);
    expect(threadKnowledgeSchema.safeParse({ topics: "should be array" }).success).toBe(false);
  });

  it("rejects non-string entity values", () => {
    expect(
      threadKnowledgeSchema.safeParse({ ...FULL, entities: { x: 123 } }).success
    ).toBe(false);
  });
});
