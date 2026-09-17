import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { LocalFileStore } from "../src/worker/storage";
import { PostgresDatabase, placeholders } from "../src/worker/postgres";
import { createEvent, updateEvent } from "../src/worker/db/queries/events";
import { initializeSchema } from "../src/worker/schema";
import app from "../src/worker/index";

test("placeholder translation preserves quoted strings and comments", () => {
  assert.equal(placeholders("SELECT '?' AS x, ? AS y, 'it''s ?' -- ?\n/* ? */ WHERE x = ?"), "SELECT '?' AS x, $1 AS y, 'it''s ?' -- ?\n/* ? */ WHERE x = $2");
});

test("local files persist bodies and metadata and reject unsafe keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workspace-files-"));
  try {
    const store = new LocalFileStore(dir);
    const key = "workspace/_/test.pdf";
    await store.put(key, new Blob(["%PDF-test"]).stream(), { httpMetadata: { contentType: "application/pdf" } });
    const object = await new LocalFileStore(dir).get(key);
    assert.ok(object);
    assert.equal(await new Response(object.body).text(), "%PDF-test");
    assert.match(object.httpEtag, /^"[a-f0-9]{64}"$/);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    assert.equal(headers.get("content-type"), "application/pdf");
    assert.equal(headers.get("content-length"), "9");
    assert.match((await readdir(dir))[0], /^[a-f0-9]{64}$/);
    for (const key of ["../escape", "/absolute", "a/../../b.pdf", "a/b/c%2f.pdf"]) {
      await assert.rejects(store.get(key), /Invalid storage key/);
      await assert.rejects(store.delete(key), /Invalid storage key/);
    }
    await store.delete(key);
    await store.delete(key);
    assert.equal(await store.get(key), null);
    const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("interrupted")); } });
    await assert.rejects(store.put("w/_/broken.pdf", broken, { httpMetadata: { contentType: "application/pdf" } }));
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("API rejects oversized request bodies before parsing", async () => {
  const response = await app.request("/api/admin/login", {
    method: "POST",
    headers: { "content-length": String(96 * 1024 * 1024 + 1), "content-type": "application/json" },
    body: "{}",
  }, {} as any);
  assert.equal(response.status, 413);
});

const url = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_POSTGRES_TEST === "1" && !url) throw new Error("TEST_DATABASE_URL is required");
if (url && !/^\/[a-zA-Z0-9_]+_test$/.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must name a disposable database ending _test");

test("PostgreSQL startup upgrades legacy tasks and preserves rows and links on rerun", { skip: !url }, async () => {
  const root = new Pool({ connectionString: url });
  const schema = `qa_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    console.log(`PostgreSQL version: ${(await pool.query("SHOW server_version")).rows[0].server_version}`);
    const baseline = await readFile("migrations/0001_initial.sql", "utf8");
    await pool.query(baseline.replace(/^.*resource_id\s+TEXT,.*\n/m, "").replace(/^.*public_id\s+TEXT.*\n/m, ""));
    await pool.query("INSERT INTO workspaces (id, name, password_hash, created_at) VALUES ('w', 'Legacy', 'unused', 1700000000000)");
    await pool.query("INSERT INTO tasks (id, workspace_id, title, status, created_at) VALUES ('legacy', 'w', 'Keep me', 'todo', 1700000000000)");
    const before = (await pool.query("SELECT * FROM tasks")).rows[0];
    await assert.rejects(pool.query("CREATE INDEX idx_tasks_resource ON tasks(resource_id)"), { code: "42703" });
    await initializeSchema(pool);
    assert.deepEqual((await pool.query("SELECT * FROM tasks")).rows, [{ ...before, resource_id: null }]);
    assert.equal((await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tasks' AND column_name = 'resource_id'")).rows[0].data_type, "text");
    await pool.query("UPDATE tasks SET resource_id = 'resource' WHERE id = 'legacy'");
    await initializeSchema(pool);
    assert.deepEqual((await pool.query("SELECT * FROM tasks")).rows, [{ ...before, resource_id: "resource" }]);
    const indexes = await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_tasks_resource'");
    assert.equal(indexes.rowCount, 1);
    assert.match(indexes.rows[0].indexdef, /\(resource_id\)/);
    assert.deepEqual((await pool.query("SELECT id, public_id FROM workspaces")).rows, [{ id: "w", public_id: "w" }]);
    assert.equal((await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'workspaces' AND column_name = 'public_id'")).rows[0].is_nullable, "NO");
    assert.equal((await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_workspaces_public_id'")).rowCount, 1);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
});

test("PostgreSQL schema, safe integers, atomic batches, events and API persistence", { skip: !url }, async () => {
  const root = new Pool({ connectionString: url });
  const schema = `qa_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const dir = await mkdtemp(join(tmpdir(), "workspace-pg-files-"));
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    await initializeSchema(pool);
    await initializeSchema(pool);
    assert.equal((await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_tasks_resource'")).rowCount, 1);
    const db = new PostgresDatabase(pool);
    const now = Date.now();
    await db.prepare("INSERT INTO workspaces (id,public_id,name,password_hash,created_at) VALUES (?,?,?,?,?)").bind("w", "w", "Workspace", "unused", now).run();
    assert.equal((await db.prepare("SELECT created_at FROM workspaces WHERE id = ?").bind("w").first<{ created_at: number }>())?.created_at, now);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM workspaces").first<{ n: number }>())?.n, 1);
    await assert.rejects(db.prepare("SELECT 9007199254740992::bigint AS n").first(), /safe range/);
    await assert.rejects(db.batch([
      db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").bind("Changed", "w"),
      db.prepare("INSERT INTO workspaces (id,public_id,name,password_hash,created_at) VALUES (?,?,?,?,?)").bind("w", "duplicate", "Duplicate", "unused", now),
    ]));
    assert.equal((await db.prepare("SELECT name FROM workspaces WHERE id = ?").bind("w").first<{ name: string }>())?.name, "Workspace");
    await createEvent(db, { id: "e", workspace_id: "w", project_id: null, title: "Event", description: null, type: "event", start_at: now, end_at: now + 100, all_day: 0, color: null, location: null, url: null, created_at: now });
    await assert.rejects(updateEvent(db, "w", "e", { start_at: now + 200 }), /End must be after start/);
    assert.equal(await updateEvent(db, "w", "e", { end_at: null }), true);
    const env = { DB: db, BUCKET: new LocalFileStore(dir), ADMIN_SECRET: "test-only-admin-secret-long-enough", PUBLIC_ORIGIN: "https://workspace.example" };
    const response = await app.request("/api/admin/workspaces", { method: "POST", headers: { "x-admin-secret": env.ADMIN_SECRET, "content-type": "application/json" }, body: JSON.stringify({ name: "API workspace", password: "password" }) }, env);
    assert.equal(response.status, 201);
    const created = await response.json() as { id: string; public_id: string; url: string };
    assert.notEqual(created.id, created.public_id);
    assert.equal(created.url, `https://workspace.example/w/${created.public_id}`);
    const unlock = await app.request(`/api/workspaces/${created.public_id}/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "password" }) }, env);
    assert.equal(unlock.status, 200);
    assert.match(unlock.headers.get("set-cookie")!, /Secure/);
    const cookie = unlock.headers.get("set-cookie")!.split(";")[0];
    const form = new FormData();
    form.set("file", new File(["%PDF-persist"], "paper.pdf", { type: "application/pdf" }));
    const upload = await app.request(`/api/workspaces/${created.public_id}/files`, { method: "POST", headers: { cookie }, body: form }, env);
    assert.equal(upload.status, 201);
    const resource = (await upload.json() as { resource: { id: string } }).resource;
    const download = await app.request(`/api/workspaces/${created.public_id}/files/${resource.id}`, { headers: { cookie } }, { ...env, BUCKET: new LocalFileStore(dir) });
    assert.equal(await download.text(), "%PDF-persist");
    assert.equal((await app.request(`/api/workspaces/${created.public_id}/files/${resource.id}`, {}, env)).status, 401);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
    await rm(dir, { recursive: true, force: true });
  }
});
