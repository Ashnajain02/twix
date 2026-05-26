import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clientKey, createRateLimit } from "../rate-limit";

describe("createRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects construction with non-positive parameters", () => {
    expect(() => createRateLimit({ max: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimit({ max: 10, windowMs: 0 })).toThrow();
    expect(() => createRateLimit({ max: -1, windowMs: 1000 })).toThrow();
  });

  it("allows requests up to max within a window", () => {
    const rl = createRateLimit({ max: 3, windowMs: 1000 });
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(false);
  });

  it("scopes buckets per key", () => {
    const rl = createRateLimit({ max: 2, windowMs: 1000 });
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(false);
    // Different key still has full budget.
    expect(rl.check("u:2").allowed).toBe(true);
  });

  it("refills tokens as time passes (token-bucket semantics)", () => {
    const rl = createRateLimit({ max: 4, windowMs: 1000 }); // 4 tokens / sec

    // Drain
    rl.check("u:1");
    rl.check("u:1");
    rl.check("u:1");
    rl.check("u:1");
    expect(rl.check("u:1").allowed).toBe(false);

    // Half-window later → 2 tokens refilled
    vi.advanceTimersByTime(500);
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(true);
    expect(rl.check("u:1").allowed).toBe(false);

    // Full window after the drain — bucket fully refilled
    vi.advanceTimersByTime(1000);
    expect(rl.check("u:1").allowed).toBe(true);
  });

  it("returns a retry-after estimate in seconds when blocked", () => {
    const rl = createRateLimit({ max: 2, windowMs: 2000 });
    rl.check("u:1");
    rl.check("u:1");
    const result = rl.check("u:1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(2);
  });
});

describe("clientKey", () => {
  function req(headers: Record<string, string> = {}): Request {
    return new Request("https://example.com/", { headers });
  }

  it("prefers user id when authenticated", () => {
    expect(clientKey(req(), "user-123")).toBe("u:user-123");
  });

  it("falls back to first IP in X-Forwarded-For", () => {
    expect(
      clientKey(req({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }), null)
    ).toBe("ip:10.0.0.1");
  });

  it("falls back to 'unknown' without a forwarded header", () => {
    expect(clientKey(req(), null)).toBe("ip:unknown");
  });
});
