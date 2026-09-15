import { Hono } from "hono";
import type { AppEnv } from "../types";
import { readJson } from "../lib/http";
import { ValidationError } from "../lib/response";
import { str } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import {
  listPushSubscriptions,
  upsertPushSubscription,
  deletePushSubscription,
} from "../db/queries/pushSubscriptions";
import { sendWebPush, type VapidKeys } from "../lib/webPush";

// Mounted at /api/workspaces/:id/push, behind workspaceSession — subscriptions
// are workspace-scoped like everything else here (no per-user identity).
const push = new Hono<AppEnv>();

function readVapid(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY_JWK?: string; VAPID_SUBJECT?: string }): VapidKeys {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK || !env.VAPID_SUBJECT) {
    throw new ValidationError("Push notifications are not configured on this deployment");
  }
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: JSON.parse(env.VAPID_PRIVATE_KEY_JWK),
    subject: env.VAPID_SUBJECT,
  };
}

function readSubscription(body: any): { endpoint: string; p256dh: string; auth: string } {
  const endpoint = str(body.endpoint, 1, 2000, "endpoint");
  const keys = body.keys;
  if (!keys || typeof keys !== "object") throw new ValidationError("keys is required");
  return {
    endpoint,
    p256dh: str(keys.p256dh, 1, 200, "keys.p256dh"),
    auth: str(keys.auth, 1, 100, "keys.auth"),
  };
}

/** GET /api/workspaces/:id/push/vapid-public-key — the client needs this to call pushManager.subscribe(). */
push.get("/vapid-public-key", async (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) return c.json({ publicKey: null });
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

/** POST /api/workspaces/:id/push/subscribe — register (or refresh) this browser's push subscription. */
push.post("/subscribe", async (c) => {
  const body = await readJson(c.req.raw);
  const sub = readSubscription(body);
  const now = Date.now();
  await upsertPushSubscription(c.env.DB, {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    created_at: now,
  });
  return c.json({ ok: true });
});

/** POST /api/workspaces/:id/push/unsubscribe */
push.post("/unsubscribe", async (c) => {
  const body = await readJson(c.req.raw);
  const endpoint = str(body.endpoint, 1, 2000, "endpoint");
  await deletePushSubscription(c.env.DB, c.get("workspaceId"), endpoint);
  return c.json({ ok: true });
});

/** POST /api/workspaces/:id/push/test — send a test notification to every subscription on this workspace. */
push.post("/test", async (c) => {
  const vapid = readVapid(c.env);
  const subs = await listPushSubscriptions(c.env.DB, c.get("workspaceId"));
  if (subs.length === 0) return c.json({ error: "No subscriptions on this workspace yet" }, 400);

  let sent = 0;
  for (const sub of subs) {
    const result = await sendWebPush(
      sub,
      { title: "Test notification", body: "Push notifications are working.", url: "/" },
      vapid,
    );
    if (result.ok) sent++;
    else if (result.gone) await deletePushSubscription(c.env.DB, c.get("workspaceId"), sub.endpoint);
  }
  return c.json({ ok: true, sent, total: subs.length });
});

export default push;
