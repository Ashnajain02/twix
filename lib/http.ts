/**
 * HTTP response helpers for API route handlers.
 *
 * Standardizes the error envelope across every endpoint:
 *   { error: string, details?: unknown }
 *
 * Always returns JSON — no plain-text responses. Clients can parse
 * a single shape for every error case.
 */

import type { ZodError } from "zod";

interface ApiErrorBody {
  error: string;
  details?: unknown;
}

export function jsonError(
  message: string,
  status: number,
  details?: unknown
): Response {
  const body: ApiErrorBody = { error: message };
  if (details !== undefined) body.details = details;
  return Response.json(body, { status });
}

export const unauthorized = () => jsonError("Unauthorized", 401);
export const notFound = (resource = "Not found") => jsonError(resource, 404);
export const badRequest = (message = "Bad request", details?: unknown) =>
  jsonError(message, 400, details);
export function tooManyRequests(retryAfterSeconds: number, message = "Too many requests"): Response {
  return Response.json(
    { error: message, retryAfter: retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

/**
 * Convert a Zod parse failure into a 400 with a structured `details` payload.
 */
export const zodError = (error: ZodError) =>
  badRequest("Invalid request body", error.issues);
