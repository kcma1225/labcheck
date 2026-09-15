import { assertProject } from "../db/queries/projects";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, optionalId } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { rateLimit } from "../middleware/rateLimit";
import { createResource, getResource } from "../db/queries/resources";

// Binary upload/download for file resources (spec sections 29–33).

const MB = 1024 * 1024;

const MAX_UPLOAD_BYTES = 95 * MB;

interface Rule {
  ext: string;
  mime: string;
  maxBytes: number;
}

const RULES: Rule[] = [
  { ext: "pdf", mime: "application/pdf", maxBytes: MAX_UPLOAD_BYTES },
  { ext: "png", mime: "image/png", maxBytes: MAX_UPLOAD_BYTES },
  { ext: "jpg", mime: "image/jpeg", maxBytes: MAX_UPLOAD_BYTES },
  { ext: "jpeg", mime: "image/jpeg", maxBytes: MAX_UPLOAD_BYTES },
  { ext: "webp", mime: "image/webp", maxBytes: MAX_UPLOAD_BYTES },
];

/** Resolve a rule from the browser-provided MIME, falling back to the filename. */
function resolveRule(mime: string, filename: string): Rule | null {
  const byMime = RULES.find((r) => r.mime === mime);
  if (byMime) return byMime;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return RULES.find((r) => r.ext === ext) ?? null;
}

const files = new Hono<AppEnv>();

const uploadLimit = rateLimit({ scope: "upload", limit: 10, windowMs: 10 * 60_000 });

/** POST /api/workspaces/:id/files — multipart form: file, name?, project_id? */
files.post("/", uploadLimit, async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "Expected a multipart form upload" }, 400);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return c.json({ error: "A file is required" }, 400);
  }

  const rule = resolveRule(file.type, file.name);
  if (!rule) {
    return c.json({ error: "Only PDF, PNG, JPEG and WebP files are allowed" }, 415);
  }
  if (file.size > rule.maxBytes) {
    return c.json({ error: `File exceeds the ${rule.maxBytes / MB} MB limit` }, 413);
  }

  const workspaceId = c.get("workspaceId");
  const projectId = optionalId(form.get("project_id"), "project_id");
  await assertProject(c.env.DB, workspaceId, projectId);
  const rawName = form.get("name");
  const name = str(typeof rawName === "string" && rawName ? rawName : file.name, 1, 200, "Name");

  const storageKey = `${workspaceId}/${projectId ?? "_"}/${randomId(20)}.${rule.ext}`;
  await c.env.BUCKET.put(storageKey, file.stream(), {
    httpMetadata: { contentType: rule.mime },
  });

  const row = {
    id: randomId(16),
    workspace_id: workspaceId,
    project_id: projectId,
    name,
    type: "file",
    url: null,
    storage_key: storageKey,
    mime_type: rule.mime,
    file_size: file.size,
    created_at: Date.now(),
  };
  try {
    await createResource(c.env.DB, row);
  } catch (error) {
    await c.env.BUCKET.delete(storageKey);
    throw error;
  }

  const { storage_key: _storageKey, ...safe } = row;
  return c.json({ resource: safe }, 201);
});

/** GET /api/workspaces/:id/files/:resourceId — stream the private file. */
files.get("/:resourceId", async (c) => {
  const r = await getResource(c.env.DB, c.get("workspaceId"), c.req.param("resourceId"));
  if (!r || !r.storage_key) return c.json({ error: "Not Found" }, 404);

  const obj = await c.env.BUCKET.get(r.storage_key);
  if (!obj) return c.json({ error: "Not Found" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(r.name)}`);
  return new Response(obj.body, { headers });
});

export default files;
