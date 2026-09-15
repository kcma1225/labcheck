import type { Context } from "hono";
import { ValidationError } from "./response";

/** Reject malformed JSON and non-object payloads before accessing fields. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Expected a JSON object");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

/** Only mark cookies Secure over HTTPS so http://localhost dev still works. */
export function cookieSecure(c: Context): boolean {
  return new URL(c.env?.PUBLIC_ORIGIN ?? c.req.url).protocol === "https:";
}
