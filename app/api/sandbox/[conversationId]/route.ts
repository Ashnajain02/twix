import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSandboxInfo, closeSandbox } from "@/lib/e2b";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  // Fast path: check in-memory sandbox map first — avoids DB roundtrip when no sandbox is active
  const info = await getSandboxInfo(conversationId);
  if (!info) {
    return Response.json({ active: false });
  }

  // Only verify ownership if a sandbox actually exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ active: true, sandboxId: info.sandboxId });
}

// DELETE — explicit close (fetch with method: DELETE)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await closeSandbox(conversationId);
  console.log(`[sandbox] Closed sandbox for conversation ${conversationId}`);
  return Response.json({ closed: true });
}

// POST — also supports close via sendBeacon (which can only send POST)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;
  const body = await req.json().catch(() => ({}));

  if (body._method !== "DELETE") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await closeSandbox(conversationId);
  console.log(`[sandbox] Closed sandbox (beacon) for conversation ${conversationId}`);
  return Response.json({ closed: true });
}
