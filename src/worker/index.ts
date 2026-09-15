import { Hono } from "hono";
import type { AppEnv } from "./types";
import { onError, notFound } from "./lib/response";
import { rateLimit, workspaceRateLimit } from "./middleware/rateLimit";
import { workspaceSession } from "./middleware/workspaceSession";

import adminRoutes from "./routes/admin";
import workspaceRoutes, { listWorkspacesHandler, unlockHandler } from "./routes/workspace";
import projectRoutes from "./routes/projects";
import groupRoutes from "./routes/groups";
import taskRoutes from "./routes/tasks";
import eventRoutes from "./routes/events";
import noteRoutes from "./routes/notes";
import resourceRoutes from "./routes/resources";
import fileRoutes from "./routes/files";
import pushRoutes from "./routes/push";
import passkeyRoutes, {
  passkeyAvailableHandler,
  passkeyLoginHandler,
  passkeyLoginOptionsHandler,
} from "./routes/passkeys";
import { bodyLimit } from "hono/body-limit";

const app = new Hono<AppEnv>();

app.onError(onError);
app.use("/api/*", bodyLimit({ maxSize: 96 * 1024 * 1024, onError: (c) => c.json({ error: "Request body too large" }, 413) }));
app.notFound((c) => (c.req.path.startsWith("/api/") ? notFound(c) : c.text("Not Found", 404)));

// --- Public endpoints (spec section 41) ----------------------------------

// Admin: create / manage workspaces. Guarded by ADMIN_SECRET inside the routes.
app.route("/api/admin", adminRoutes);

// Public workspace directory for the Home page's open-link list.
app.get(
  "/api/workspaces",
  rateLimit({ scope: "workspace-list", limit: 60, windowMs: 60_000, by: (c) => c.env?.CLIENT_IP ?? "anon" }),
  listWorkspacesHandler,
);

// Workspace unlock — the most exposed endpoint (spec section 42).
// Soft limit: 10 attempts / minute per IP+workspace.
app.post(
  "/api/workspaces/:id/unlock",
  rateLimit({
    scope: "unlock",
    limit: 10,
    windowMs: 60_000,
    by: (c) => `${c.env?.CLIENT_IP ?? "anon"}:${c.req.param("id")}`,
  }),
  unlockHandler,
);

// Passkey login — same exposure/rate-limit profile as /unlock, since it's
// the other way into a workspace without a session. /available is a cheap
// read (no challenge minted) so the login screen can decide whether to show
// the button at all without spending a rate-limit slot on every page load.
const passkeyLoginLimit = rateLimit({
  scope: "passkey-login",
  limit: 10,
  windowMs: 60_000,
  by: (c) => `${c.env?.CLIENT_IP ?? "anon"}:${c.req.param("id")}`,
});
app.get("/api/workspaces/:id/passkey/available", passkeyAvailableHandler);
app.post("/api/workspaces/:id/passkey/login-options", passkeyLoginLimit, passkeyLoginOptionsHandler);
app.post("/api/workspaces/:id/passkey/login", passkeyLoginLimit, passkeyLoginHandler);

// --- Authenticated workspace API (spec sections 34–36) ------------------

const ws = new Hono<AppEnv>();
ws.use("*", workspaceSession);
ws.use("*", workspaceRateLimit());

ws.route("/", workspaceRoutes); // GET / PATCH /  + POST /lock
ws.route("/projects", projectRoutes);
ws.route("/groups", groupRoutes);
ws.route("/tasks", taskRoutes);
ws.route("/events", eventRoutes);
ws.route("/notes", noteRoutes);
ws.route("/resources", resourceRoutes);
ws.route("/files", fileRoutes);
ws.route("/push", pushRoutes);
ws.route("/passkeys", passkeyRoutes);

app.route("/api/workspaces/:id", ws);

export default app;
