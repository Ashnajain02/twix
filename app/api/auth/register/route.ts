import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, tooManyRequests, zodError } from "@/lib/http";
import { createLogger } from "@/lib/logger";
import { clientKey, createRateLimit } from "@/lib/rate-limit";

const log = createLogger("auth/register");

// 5 registration attempts / minute per IP — slows down credential-stuffing
// and email-enumeration probes without blocking legitimate signups.
const limiter = createRateLimit({ max: 5, windowMs: 60_000 });

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export async function POST(req: Request) {
  const rl = limiter.check(clientKey(req, null));
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return jsonError("Email already registered", 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, email: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    log.error("registration failed", e);
    return jsonError("Internal server error", 500);
  }
}
