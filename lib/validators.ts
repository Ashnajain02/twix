import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

export const createTangentSchema = z.object({
  parentThreadId: z.string().min(1),
  highlightedText: z.string().min(1).max(5000),
});

const chatMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

export const chatRequestSchema = z.object({
  threadId: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(chatMessagePartSchema),
      })
    )
    .min(1),
});

export const archiveThreadSchema = z.object({
  status: z.literal("ARCHIVED"),
});
