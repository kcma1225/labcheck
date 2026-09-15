import { serve, type HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { Pool } from "pg";
import { initializeSchema } from "./schema";
import app from "./index";
import { PostgresDatabase } from "./postgres";
import { LocalFileStore } from "./storage";
import { sendDueReminders } from "./lib/reminders";
import type { Env } from "./types";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const origin = new URL(required("PUBLIC_ORIGIN"));
if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== process.env.PUBLIC_ORIGIN) throw new Error("PUBLIC_ORIGIN must be an HTTP(S) origin without a trailing slash");
const secret = required("ADMIN_SECRET");
const pool = new Pool({ connectionString: required("DATABASE_URL"), connectionTimeoutMillis: 10_000, max: 10 });
pool.on("error", () => console.error("Unexpected PostgreSQL connection error"));
try {
  await initializeSchema(pool);
} catch {
  console.error("PostgreSQL schema initialization failed; check database connectivity and schema compatibility");
  await pool.end();
  process.exit(1);
}

const env: Env = {
  DB: new PostgresDatabase(pool),
  BUCKET: new LocalFileStore(process.env.STORAGE_DIR ?? "./data/files"),
  ADMIN_SECRET: secret,
  PUBLIC_ORIGIN: origin.origin,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY_JWK: process.env.VAPID_PRIVATE_KEY_JWK,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};
const web = new Hono<{ Bindings: HttpBindings }>();
web.get("/api/health", async (c) => {
  try { await pool.query("SELECT 1"); return c.json({ ok: true }); }
  catch { return c.json({ ok: false }, 503); }
});
// TRUST_PROXY is set by compose.yaml, since Nginx is the only thing that can
// reach this container's socket there (no host port is published on `app`).
// It must stay unset for `npm run dev`/`npm start`, where the socket peer is
// the real client and an X-Real-IP header would be attacker-controlled.
const trustProxy = process.env.TRUST_PROXY === "1";
function clientIp(c: Context<{ Bindings: HttpBindings }>): string {
  if (trustProxy) {
    const header = c.req.header("x-real-ip");
    if (header) return header;
  }
  return c.env.incoming?.socket?.remoteAddress ?? "anon";
}
web.all("/api/*", (c) => app.fetch(c.req.raw, { ...env, CLIENT_IP: clientIp(c) }));
web.all("/api", (c) => c.json({ error: "Not Found" }, 404));
web.get("/offline.html", serveStatic({ path: "./dist/offline.html" }));
web.use("*", serveStatic({ root: "./dist" }));
web.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve({ fetch: web.fetch, port: Number(process.env.PORT ?? 8787), hostname: process.env.HOST ?? "0.0.0.0" });

let pending: Promise<void> | undefined;
let stopping = false;
async function remind() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(73462102) AS locked");
    if (!result.rows[0].locked) return;
    try { await sendDueReminders(env); }
    finally { await client.query("SELECT pg_advisory_unlock(73462102)"); }
  } finally { client.release(); }
}
function tick() {
  if (pending || stopping) return;
  pending = remind().catch(() => console.error("Reminder cycle failed")).finally(() => { pending = undefined; });
}
const timer = setInterval(tick, 30 * 60 * 1000);
tick();
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1), 30_000);
  deadline.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pending;
  await pool.end();
  clearTimeout(deadline);
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
