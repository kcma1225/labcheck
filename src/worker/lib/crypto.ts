// Password hashing (PBKDF2-SHA256 via WebCrypto), random ids, and session tokens.

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;

// Unambiguous base-56 alphabet (no 0/O/1/I/l) for human-shareable ids.
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** High-entropy random id. Default 24 chars ≈ 138 bits (spec section 11). */
export function randomId(len = 24): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ID_ALPHABET[buf[i] % ID_ALPHABET.length];
  return out;
}

/** 256-bit random session token, base64url, no padding (spec section 15). */
export function newSessionToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return bytesToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2-sha256") return false;
    const iterations = Number.parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations < 1) return false;
    const salt = b64ToBytes(saltB64);
    const expected = b64ToBytes(hashB64);
    const bits = await deriveBits(password, salt, iterations);
    return timingSafeEqual(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

/** Constant-time string comparison for the admin secret (spec section 9). */
export function safeEqualStr(a: string, b: string): boolean {
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}

// --- internals -------------------------------------------------------------

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
}

function timingSafeEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

function bytesToB64(b: Uint8Array<ArrayBuffer>): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

function bytesToHex(b: Uint8Array<ArrayBuffer>): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export function b64urlEncode(b: Uint8Array<ArrayBuffer>): string {
  return bytesToB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return b64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/** HMAC-SHA256 signed, stateless admin token: `<payload>.<sig>` (spec keeps no admin table). */
export async function createSignedToken(secret: string, payload: object): Promise<string> {
  const body = enc.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return `${b64urlEncode(body)}.${b64urlEncode(sig)}`;
}

export async function verifySignedToken<T = unknown>(secret: string, token: string): Promise<T | null> {
  try {
    const [bodyB64, sigB64] = token.split(".");
    if (!bodyB64 || !sigB64) return null;
    const body = b64urlDecode(bodyB64);
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64), body);
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    return null;
  }
}
