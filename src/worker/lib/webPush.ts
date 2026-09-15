// Implements RFC 8292 (VAPID) for sender identification and RFC 8291 +
// RFC 8188 (aes128gcm) for payload encryption, exactly as browsers require.

const enc = new TextEncoder();

export interface PushEndpoint {
  endpoint: string;
  p256dh: string; // base64url, from PushSubscription.getKey('p256dh')
  auth: string; // base64url, from PushSubscription.getKey('auth')
}

export interface VapidKeys {
  /** base64url-encoded raw EC point (0x04 || X || Y), shared with the browser as `applicationServerKey`. */
  publicKey: string;
  /** The matching EC private key, as a JWK — the only format WebCrypto can import directly. */
  privateJwk: JsonWebKey;
  /** Contact URI sent to the push service, e.g. "mailto:admin@example.com". */
  subject: string;
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** True on 404/410 — the push service says this subscription is gone and should be deleted. */
  gone: boolean;
}

export async function sendWebPush(sub: PushEndpoint, payload: unknown, vapid: VapidKeys): Promise<PushResult> {
  const jwt = await signVapidJwt(sub.endpoint, vapid);
  const body = await encryptPayload(JSON.stringify(payload), sub);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });
  // Drain the body so the connection can be reused; we don't need the content.
  await res.arrayBuffer().catch(() => undefined);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// --- RFC 8292 — VAPID JWT (ES256) -------------------------------------------

async function signVapidJwt(endpoint: string, vapid: VapidKeys): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: vapid.subject };
  const unsigned = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    vapid.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto's ECDSA signature is the raw (r || s) 64-byte form — exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

// --- RFC 8291 / RFC 8188 — aes128gcm payload encryption ---------------------

async function encryptPayload(payload: string, sub: PushEndpoint): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublicRaw = b64urlDecode(sub.p256dh); // subscriber's 65-byte uncompressed EC point
  const authSecret = b64urlDecode(sub.auth); // subscriber's 16-byte auth secret

  // Ephemeral EC key pair for this one message ("as" = application server).
  const localKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", localKeyPair.publicKey)) as ArrayBuffer);

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey } as EcdhKeyDeriveParams,
      localKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.4: derive the shared IKM that feeds the aes128gcm content coding below.
  const keyInfo = concatBytes(enc.encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188 aes128gcm content coding — one record, so the record-size (rs) just
  // has to be big enough to hold this message; 4096 comfortably covers our payloads.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concatBytes(enc.encode(payload), new Uint8Array([0x02])); // 0x02 = last (only) record
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  const rs = 4096;
  const header = concatBytes(
    salt,
    new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]),
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw,
  );
  return concatBytes(header, ciphertext);
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

function concatBytes(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function b64url(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
