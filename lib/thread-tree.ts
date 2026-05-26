import { prisma } from "./prisma";

/**
 * Collects all ACTIVE descendant thread IDs of a given root thread within
 * a conversation. Used by archive + merge flows where archiving a thread
 * should cascade to its still-active children.
 *
 * Implementation: one batch query for all active threads in the conversation,
 * then in-memory BFS over the parent→children map. Avoids the N+1 we'd get
 * from walking the tree level-by-level with separate queries.
 *
 * @returns Descendant IDs (excluding the root itself). Empty if no active
 *   descendants. Order is BFS order from the root.
 */
export async function collectActiveDescendants(
  conversationId: string,
  rootThreadId: string
): Promise<string[]> {
  const active = await prisma.thread.findMany({
    where: { conversationId, status: "ACTIVE" },
    select: { id: true, parentThreadId: true },
  });

  const childrenByParent = new Map<string, string[]>();
  for (const t of active) {
    if (!t.parentThreadId) continue;
    const list = childrenByParent.get(t.parentThreadId);
    if (list) list.push(t.id);
    else childrenByParent.set(t.parentThreadId, [t.id]);
  }

  const descendants: string[] = [];
  const visited = new Set<string>([rootThreadId]);
  const queue: string[] = [rootThreadId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = childrenByParent.get(currentId);
    if (!children) continue;
    for (const childId of children) {
      // Defensive: schema guarantees a DAG (single parent per thread), but
      // a `visited` set keeps us safe if anything corrupts that invariant.
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendants.push(childId);
      queue.push(childId);
    }
  }
  return descendants;
}
