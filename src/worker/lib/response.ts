import type { Context } from "hono";

/** Thrown by validation helpers; surfaced to the client as a 400 (spec section 38). */
export class ValidationError extends Error {}

/** Thrown for auth failures we want to short-circuit from deep in a handler. */
export class HttpError extends Error {
  constructor(
    public status: 401 | 403 | 404 | 409 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(c: Context) {
  return c.json({ error: "Not Found" }, 404);
}

export function onError(err: Error, c: Context) {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error("Unhandled API error");
  return c.json({ error: "Internal Server Error" }, 500);
}
