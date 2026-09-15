import { Hono } from "hono";
import type { Context } from "hono";
import { server } from "@passwordless-id/webauthn";
import type { AppEnv } from "../types";
import { readJson } from "../lib/http";
import { ValidationError } from "../lib/response";
import { str } from "../middleware/validation";
import { issueWorkspaceSession } from "../lib/workspaceAuth";
import { createSignedToken, verifySignedToken } from "../lib/crypto";
import { getWorkspace } from "../db/queries/workspaces";
import {
  countPasskeys,
  createPasskey,
  deletePasskey,
  getPasskey,
  listPasskeys,
  touchPasskey,
} from "../db/queries/passkeys";

// A passkey is an alternate way INTO a workspace, not a separate identity —
// this app has none. Registering one requires an existing (password-backed)
// session; from then on, the passkey alone can open the workspace, same as
// the password. Multiple people can each register their own under a name
// they choose (see the `name` field), all equally valid for that workspace.

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface ChallengePayload {
  purpose: "passkey-register" | "passkey-login";
  workspaceId: string;
  challenge: string;
  exp: number;
}

function expectedOrigin(c: Context<AppEnv>) {
  const origin = c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin;
  return (candidate: string) => candidate === origin;
}

async function issueChallenge(
  c: Context<AppEnv>,
  purpose: ChallengePayload["purpose"],
  workspaceId: string,
): Promise<{ challenge: string; token: string }> {
  const challenge = server.randomChallenge();
  const payload: ChallengePayload = {
    purpose,
    workspaceId,
    challenge,
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  const token = await createSignedToken(c.env.ADMIN_SECRET, payload);
  return { challenge, token };
}

async function consumeChallenge(
  c: Context<AppEnv>,
  purpose: ChallengePayload["purpose"],
  workspaceId: string,
  token: unknown,
): Promise<string> {
  if (typeof token !== "string") throw new ValidationError("Missing challenge token");
  const payload = await verifySignedToken<ChallengePayload>(c.env.ADMIN_SECRET, token);
  if (
    !payload ||
    payload.purpose !== purpose ||
    payload.workspaceId !== workspaceId ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now()
  ) {
    throw new ValidationError("This passkey request has expired — please try again");
  }
  return payload.challenge;
}

// --- authenticated (requires an existing workspace session) ----------------
// Mounted under /api/workspaces/:id/passkeys, behind workspaceSession.

const passkeys = new Hono<AppEnv>();

passkeys.get("/", async (c) => {
  return c.json({ passkeys: await listPasskeys(c.env.DB, c.get("workspaceId")) });
});

passkeys.post("/register-options", async (c) => {
  const workspaceId = c.get("workspaceId");
  const { challenge, token } = await issueChallenge(c, "passkey-register", workspaceId);
  return c.json({ challenge, token });
});

passkeys.post("/register", async (c) => {
  const workspaceId = c.get("workspaceId");
  const body = await readJson(c.req.raw);
  const name = str(body.name, 1, 100, "Passkey name");
  if (!body.registration || typeof body.registration !== "object") {
    throw new ValidationError("Missing registration response");
  }
  const challenge = await consumeChallenge(c, "passkey-register", workspaceId, body.token);

  const info = await server.verifyRegistration(body.registration as any, {
    challenge,
    origin: expectedOrigin(c),
    userVerified: true,
  });

  const now = Date.now();
  await createPasskey(c.env.DB, {
    id: info.credential.id,
    workspace_id: workspaceId,
    name,
    public_key: info.credential.publicKey,
    algorithm: info.credential.algorithm,
    counter: info.authenticator.counter,
    created_at: now,
  });

  return c.json({ passkey: { id: info.credential.id, name, created_at: now, last_used_at: null } }, 201);
});

passkeys.delete("/:passkeyId", async (c) => {
  const ok = await deletePasskey(c.env.DB, c.get("workspaceId"), c.req.param("passkeyId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default passkeys;

// --- public (no session yet — this IS how you get one) ---------------------
// Mounted directly on the top-level app, next to POST /unlock.

export async function passkeyAvailableHandler(c: Context<AppEnv>) {
  const workspaceId = c.req.param("id")!;
  const count = await countPasskeys(c.env.DB, workspaceId);
  return c.json({ available: count > 0 });
}

export async function passkeyLoginOptionsHandler(c: Context<AppEnv>) {
  const workspaceId = c.req.param("id")!;
  const ws = await getWorkspace(c.env.DB, workspaceId);
  if (!ws) return c.json({ error: "Not Found" }, 404);

  const credentials = await listPasskeys(c.env.DB, workspaceId);
  const { challenge, token } = await issueChallenge(c, "passkey-login", workspaceId);
  return c.json({ challenge, token, credentialIds: credentials.map((p) => p.id) });
}

export async function passkeyLoginHandler(c: Context<AppEnv>) {
  const workspaceId = c.req.param("id")!;
  const body = await readJson(c.req.raw);
  if (!body.authentication || typeof body.authentication !== "object") {
    throw new ValidationError("Missing authentication response");
  }
  const authentication = body.authentication as { id?: unknown };
  const credentialId = typeof authentication.id === "string" ? authentication.id : null;
  if (!credentialId) throw new ValidationError("Malformed authentication response");

  const challenge = await consumeChallenge(c, "passkey-login", workspaceId, body.token);

  const row = await getPasskey(c.env.DB, workspaceId, credentialId);
  if (!row) return c.json({ error: "Unrecognized passkey" }, 401);

  let info;
  try {
    info = await server.verifyAuthentication(
      body.authentication as any,
      { id: row.id, publicKey: row.public_key, algorithm: row.algorithm as any, transports: [] },
      { challenge, origin: expectedOrigin(c), userVerified: true, counter: row.counter },
    );
  } catch {
    return c.json({ error: "Passkey verification failed" }, 401);
  }

  const now = Date.now();
  await touchPasskey(c.env.DB, row.id, info.counter, now);
  await issueWorkspaceSession(c, workspaceId);

  const ws = await getWorkspace(c.env.DB, workspaceId);
  return c.json({ workspace: { id: workspaceId, name: ws?.name ?? "" } });
}
