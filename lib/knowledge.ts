import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel } from "./ai";
import { prisma } from "./prisma";

/**
 * Structured knowledge distillation for conversation threads.
 *
 * Instead of compressing conversations into lossy paragraph summaries,
 * this module extracts structured, queryable knowledge:
 *   - Facts established during discussion
 *   - Decisions made
 *   - Open questions still unresolved
 *   - User preferences discovered
 *   - Key entities and their roles
 *
 * Why structured > paragraph:
 *   1. The LLM can scan structured context faster and more accurately
 *   2. Cross-branch knowledge can be merged cleanly (union facts, resolve conflicts)
 *   3. Contradictions across branches become detectable
 *   4. Individual fields can be selectively injected based on relevance
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const threadKnowledgeSchema = z.object({
  topics: z
    .array(z.string())
    .describe("Main topics and themes discussed (concise labels, 2-5 words each)"),
  facts: z
    .array(z.string())
    .describe(
      "Key facts, information, or conclusions established. " +
      "Be specific — include names, numbers, technical details. " +
      "Each fact should be self-contained and understandable without surrounding context."
    ),
  decisions: z
    .array(z.string())
    .describe(
      "Concrete decisions or choices made during the conversation. " +
      "Include what was decided AND why if the reasoning was stated."
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      "Questions raised but not yet resolved. " +
      "Only include genuinely open questions, not rhetorical ones."
    ),
  preferences: z
    .array(z.string())
    .describe(
      "User preferences, constraints, or requirements discovered. " +
      'E.g. "prefers Python over JavaScript", "wants beginner-friendly explanations".'
    ),
  entities: z
    .record(z.string(), z.string())
    .describe(
      "Important entities mentioned and their brief descriptions. " +
      "Key = entity name, value = what it is or its role in the conversation. " +
      "Include people, technologies, projects, concepts."
    ),
});

export type ThreadKnowledge = z.infer<typeof threadKnowledgeSchema>;

// ---------------------------------------------------------------------------
// Distillation
// ---------------------------------------------------------------------------

/**
 * Distills a thread's conversation into structured knowledge.
 *
 * Reads all non-system messages, sends them to the LLM with a structured
 * output schema, and returns a typed knowledge object.
 *
 * @param threadId - The thread to distill
 * @returns Structured knowledge, or null if the thread has too few messages
 */
export async function distillThreadKnowledge(
  threadId: string
): Promise<ThreadKnowledge | null> {
  const messages = await prisma.message.findMany({
    where: { threadId, role: { not: "SYSTEM" } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // Not enough signal to distill meaningful knowledge
  if (messages.length < 6) return null;

  // Build a condensed transcript — truncate individual messages to control
  // input size while preserving enough content for accurate extraction
  const transcript = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const result = await generateText({
    model: chatModel,
    output: Output.object({ schema: threadKnowledgeSchema }),
    prompt:
      "Extract structured knowledge from the following conversation. " +
      "Be thorough but concise — every entry should carry real information. " +
      "Omit empty categories rather than filling them with vague entries.\n\n" +
      transcript,
  });

  return result.output ?? null;
}

// ---------------------------------------------------------------------------
// Formatting for context injection
// ---------------------------------------------------------------------------

/**
 * Formats structured knowledge into a compact, LLM-readable string
 * for injection into the context window.
 *
 * Uses a terse but scannable format:
 *   - One line per category
 *   - Pipe-separated entries within categories
 *   - Skips empty categories entirely
 *
 * @param knowledge - The structured knowledge to format
 * @param label     - A label for this knowledge block (e.g., "Main Thread", "depth 0")
 * @returns Formatted string ready for context injection
 */
export function formatKnowledgeForContext(
  knowledge: ThreadKnowledge,
  label: string
): string {
  const lines: string[] = [`[Thread Knowledge — ${label}:`];

  if (knowledge.topics.length > 0) {
    lines.push(`  Topics: ${knowledge.topics.join(", ")}`);
  }
  if (knowledge.facts.length > 0) {
    lines.push(`  Facts: ${knowledge.facts.join(" | ")}`);
  }
  if (knowledge.decisions.length > 0) {
    lines.push(`  Decisions: ${knowledge.decisions.join(" | ")}`);
  }
  if (knowledge.openQuestions.length > 0) {
    lines.push(`  Open Questions: ${knowledge.openQuestions.join(" | ")}`);
  }
  if (knowledge.preferences.length > 0) {
    lines.push(`  User Preferences: ${knowledge.preferences.join(" | ")}`);
  }

  const entityEntries = Object.entries(knowledge.entities);
  if (entityEntries.length > 0) {
    const entityStr = entityEntries
      .map(([name, desc]) => `${name}: ${desc}`)
      .join(" | ");
    lines.push(`  Entities: ${entityStr}`);
  }

  lines.push("]");
  return lines.join("\n");
}

