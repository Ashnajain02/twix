import { describe, it, expect } from "vitest";
import {
  archiveThreadSchema,
  chatRequestSchema,
  createConversationSchema,
  createTangentSchema,
  updateConversationSchema,
} from "../validators";

describe("validators", () => {
  describe("createConversationSchema", () => {
    it("accepts empty object", () => {
      expect(createConversationSchema.safeParse({}).success).toBe(true);
    });

    it("accepts optional title", () => {
      expect(
        createConversationSchema.safeParse({ title: "My Chat" }).success
      ).toBe(true);
    });

    it("rejects title over 200 chars", () => {
      expect(
        createConversationSchema.safeParse({ title: "a".repeat(201) }).success
      ).toBe(false);
    });
  });

  describe("updateConversationSchema", () => {
    it("requires a title", () => {
      expect(updateConversationSchema.safeParse({}).success).toBe(false);
    });

    it("rejects empty string", () => {
      expect(updateConversationSchema.safeParse({ title: "" }).success).toBe(false);
    });

    it("accepts valid title", () => {
      expect(
        updateConversationSchema.safeParse({ title: "Renamed" }).success
      ).toBe(true);
    });

    it("rejects title over 200 chars", () => {
      expect(
        updateConversationSchema.safeParse({ title: "a".repeat(201) }).success
      ).toBe(false);
    });
  });

  describe("createTangentSchema", () => {
    it("accepts valid tangent input", () => {
      expect(
        createTangentSchema.safeParse({
          parentThreadId: "thread-123",
          highlightedText: "some interesting text",
        }).success
      ).toBe(true);
    });

    it("rejects empty parentThreadId", () => {
      expect(
        createTangentSchema.safeParse({
          parentThreadId: "",
          highlightedText: "text",
        }).success
      ).toBe(false);
    });

    it("rejects empty highlightedText", () => {
      expect(
        createTangentSchema.safeParse({
          parentThreadId: "thread-123",
          highlightedText: "",
        }).success
      ).toBe(false);
    });

    it("rejects highlightedText over 5000 chars", () => {
      expect(
        createTangentSchema.safeParse({
          parentThreadId: "thread-123",
          highlightedText: "a".repeat(5001),
        }).success
      ).toBe(false);
    });

    it("rejects missing fields", () => {
      expect(createTangentSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("chatRequestSchema", () => {
    it("accepts a valid chat request", () => {
      expect(
        chatRequestSchema.safeParse({
          threadId: "thread-123",
          messages: [
            {
              id: "msg-1",
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
            },
          ],
        }).success
      ).toBe(true);
    });

    it("rejects missing threadId", () => {
      expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    });

    it("rejects empty threadId", () => {
      expect(
        chatRequestSchema.safeParse({ threadId: "", messages: [] }).success
      ).toBe(false);
    });

    it("rejects an empty messages array", () => {
      expect(
        chatRequestSchema.safeParse({
          threadId: "thread-123",
          messages: [],
        }).success
      ).toBe(false);
    });

    it("rejects invalid message role", () => {
      expect(
        chatRequestSchema.safeParse({
          threadId: "thread-123",
          messages: [{ id: "msg-1", role: "invalid", parts: [] }],
        }).success
      ).toBe(false);
    });
  });

  describe("archiveThreadSchema", () => {
    it("accepts ARCHIVED status", () => {
      expect(archiveThreadSchema.safeParse({ status: "ARCHIVED" }).success).toBe(
        true
      );
    });

    it("rejects any other status", () => {
      expect(archiveThreadSchema.safeParse({ status: "MERGED" }).success).toBe(
        false
      );
    });
  });
});
