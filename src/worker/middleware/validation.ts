import { ValidationError } from "../lib/response";

// Hand-rolled validators — no schema library, matching the exact limits in
// spec section 38. All server-side; frontend validation is UX only.

export function str(v: unknown, min: number, max: number, field: string): string {
  if (typeof v !== "string") throw new ValidationError(`${field} is required`);
  const t = v.trim();
  if (t.length < min || t.length > max) {
    throw new ValidationError(`${field} must be ${min}–${max} characters`);
  }
  return t;
}

export function optionalStr(v: unknown, max: number, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be text`);
  const t = v.trim();
  if (t.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return t === "" ? null : t;
}

/** Preserve Markdown indentation and trailing line-break spaces in notes. */
export function noteContent(v: unknown, max: number): string {
  if (typeof v !== "string") throw new ValidationError("Content is required");
  if (v.length > max) throw new ValidationError(`Content must be at most ${max} characters`);
  return v;
}

/** Workspace/admin password: any non-empty string, no character-count rules (kept
 *  only a high sanity cap so PBKDF2 input can't be abused). */
export function password(v: unknown, field = "Password"): string {
  if (typeof v !== "string" || v.length < 1) throw new ValidationError(`${field} is required`);
  if (v.length > 1024) throw new ValidationError(`${field} is too long`);
  return v;
}

export function optionalBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return v === true || v === "true" || v === 1 || v === "1";
}

export function optionalColor(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) {
    throw new ValidationError(`${field} must be a #RRGGBB hex color`);
  }
  return v.toLowerCase();
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

export function optionalInt(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  if ((typeof v !== "number" && typeof v !== "string") || (typeof v === "string" && !v.trim())) {
    throw new ValidationError(`${field} must be an integer`);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 8_640_000_000_000_000) {
    throw new ValidationError(`${field} must be a valid integer timestamp`);
  }
  return n;
}

export function requiredInt(v: unknown, field: string): number {
  const n = optionalInt(v, field);
  if (n === null) throw new ValidationError(`${field} is required`);
  return n;
}

export function optionalId(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 64) throw new ValidationError(`${field} is invalid`);
  return v;
}

/** Parse `?from=YYYY-MM-DD` / `?to=YYYY-MM-DD` into an epoch-ms range. */
export function parseDateRange(from: string | undefined, to: string | undefined): { fromMs: number; toMs: number } {
  const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : Number.NaN;
  const toMs = to ? Date.parse(`${to}T23:59:59.999Z`) : Number.NaN;
  return {
    fromMs: Number.isFinite(fromMs) ? fromMs : 0,
    toMs: Number.isFinite(toMs) ? toMs : Number.MAX_SAFE_INTEGER,
  };
}

/** Split a comma list query param (`?status=todo,doing`). */
export function csv(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}
