import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/worker/index';
import { sha256Hex, hashPassword } from '../src/worker/lib/crypto';
import { optionalInt } from '../src/worker/middleware/validation';
import { setWorkspacePassword } from '../src/worker/db/queries/workspaces';
import { createEvent, updateEvent } from '../src/worker/db/queries/events';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_initial.sql']) {
    sql.exec(readFileSync(`migrations/${name}`, 'utf8'));
  }
  function statement(query: string, values: any[] = []): any {
    return {
      bind: (...args: any[]) => statement(query, args),
      first: async () => sql.prepare(query).get(...values) ?? null,
      all: async () => ({ results: sql.prepare(query).all(...values) }),
      run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...values).changes) } }),
    };
  }
  const db = {
    prepare: statement,
    batch: async (statements: any[]) => {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const objects = new Map();
  const env: any = {
    DB: db, ADMIN_SECRET: 'test-admin-secret',
    BUCKET: {
      put: async (key: string, body: any) => { objects.set(key, body); },
      delete: async (key: string) => { objects.delete(key); },
    },
  };
  sql.exec("INSERT INTO workspaces (id,name,password_hash,created_at) VALUES ('w','Workspace','unused',0), ('other','Other','unused',0)");
  // Unique per fixture — the rate limiter's bucket map is module-level (mirrors
  // production's per-isolate state) and keys writes by this cookie, so a shared
  // token across tests would let one test's requests exhaust another's budget.
  const fixtureToken = `local-test-token-${Math.random().toString(36).slice(2)}`;
  async function request(path: string, method = 'GET', body?: any) {
    const token = fixtureToken;
    sql.prepare('INSERT OR REPLACE INTO workspace_sessions VALUES (?,?,?,?)').run(await sha256Hex(token), 'w', Date.now() + 60_000, 0);
    const headers: Record<string, string> = { cookie: `workspace_session=${token}` };
    if (!(body instanceof FormData)) headers['content-type'] = 'application/json';
    return app.request(`/api/workspaces/w/${path}`, {
      method, headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    }, env);
  }
  return { sql, db: db as any, env, request, objects };
}

test('JSON routes reject null, arrays and malformed bodies with 400', async () => {
  const f = fixture();
  try {
    for (const path of ['tasks','events','notes','resources','projects','groups']) {
      for (const body of [null, [], 'text']) assert.equal((await f.request(path, 'POST', body)).status, 400);
    }
    const res = await app.request('/api/admin/workspaces', {
      method: 'POST', headers: { 'x-admin-secret': f.env.ADMIN_SECRET, 'content-type': 'application/json' }, body: '{',
    }, f.env);
    assert.equal(res.status, 400);
  } finally { f.sql.close(); }
});

test('password rotation invalidates only that workspace’s sessions', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO workspace_sessions VALUES ('a','w',999,0),('b','other',999,0)");
    await setWorkspacePassword(f.db, 'w', 'new-hash');
    assert.deepEqual(f.sql.prepare('SELECT id FROM workspace_sessions').all().map(r => r.id), ['b']);
    assert.equal(f.sql.prepare("SELECT password_hash FROM workspaces WHERE id='w'").get()!.password_hash, 'new-hash');
  } finally { f.sql.close(); }
});

test('public workspace listing requires no auth and never exposes password hashes', async () => {
  const f = fixture();
  try {
    const res = await app.request('/api/workspaces', {}, f.env);
    assert.equal(res.status, 200);
    const { workspaces } = await res.json() as any;
    assert.equal(workspaces.length, 2);
    const ids = workspaces.map((w: any) => w.id).sort();
    assert.deepEqual(ids, ['other', 'w']);
    for (const w of workspaces) {
      assert.deepEqual(Object.keys(w).sort(), ['id', 'name']);
    }
  } finally { f.sql.close(); }
});

test('project references reject missing and foreign workspace projects', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO projects (id,workspace_id,name,created_at) VALUES ('foreign','other','Foreign',0),('local','w','Local',0)");
    for (const id of ['missing','foreign']) {
      assert.equal((await f.request('events', 'POST', { title: 'Event', start_at: 100, project_id: id })).status, 400);
    }
    assert.equal((await f.request('events', 'POST', { title: 'Event', start_at: 100, project_id: 'local' })).status, 201);
  } finally { f.sql.close(); }
});

test('project group_id references reject missing and foreign workspace groups', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO groups (id,workspace_id,name,created_at) VALUES ('foreign','other','Foreign',0),('local','w','Local',0)");
    for (const id of ['missing','foreign']) {
      assert.equal((await f.request('projects', 'POST', { name: 'Tab', group_id: id })).status, 400);
    }
    const res = await f.request('projects', 'POST', { name: 'Tab', group_id: 'local' });
    assert.equal(res.status, 201);
    const { project } = await res.json() as any;
    assert.equal(project.group_id, 'local');
  } finally { f.sql.close(); }
});

test('group names must be unique per workspace (case-insensitive); tab names may repeat', async () => {
  const f = fixture();
  try {
    const first = await f.request('groups', 'POST', { name: 'Research' });
    assert.equal(first.status, 201);
    const { group } = await first.json() as any;

    const dup = await f.request('groups', 'POST', { name: 'research' });
    assert.equal(dup.status, 409);

    // A group with the same name in a different workspace is unaffected.
    f.sql.exec("INSERT INTO groups (id,workspace_id,name,created_at) VALUES ('foreign-group','other','Research',0)");

    // Renaming a group to its own current name (no-op) must not 409.
    const renameSelf = await f.request(`groups/${group.id}`, 'PATCH', { name: 'Research' });
    assert.equal(renameSelf.status, 200);

    // Renaming a second group to collide with the first must 409.
    const second = await f.request('groups', 'POST', { name: 'Second' });
    const { group: secondGroup } = await second.json() as any;
    const renameCollide = await f.request(`groups/${secondGroup.id}`, 'PATCH', { name: 'RESEARCH' });
    assert.equal(renameCollide.status, 409);

    // Tabs (projects) may freely share names.
    const tabA = await f.request('projects', 'POST', { name: 'Same Name' });
    const tabB = await f.request('projects', 'POST', { name: 'Same Name' });
    assert.equal(tabA.status, 201);
    assert.equal(tabB.status, 201);
  } finally { f.sql.close(); }
});

test('group deletion keeps its tabs and clears their group_id', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO groups (id,workspace_id,name,created_at) VALUES ('g','w','Group',0)");
    await f.request('projects', 'POST', { name: 'Tab A', group_id: 'g' });
    await f.request('projects', 'POST', { name: 'Tab B', group_id: 'g' });
    assert.equal((await f.request('groups/g', 'DELETE')).status, 200);
    const rows = f.sql.prepare('SELECT group_id FROM projects').all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r: any) => r.group_id === null));
  } finally { f.sql.close(); }
});

test('reorder endpoints persist the new sort order for tabs and groups', async () => {
  const f = fixture();
  try {
    const ids: string[] = [];
    for (const name of ['A','B','C']) {
      const res = await f.request('projects', 'POST', { name });
      ids.push((await res.json() as any).project.id);
    }
    const reversed = [...ids].reverse();
    assert.equal((await f.request('projects/reorder', 'POST', { ids: reversed })).status, 200);
    const rows = f.sql.prepare('SELECT id, sort_order FROM projects ORDER BY sort_order').all() as any[];
    assert.deepEqual(rows.map((r) => r.id), reversed);

    assert.equal((await f.request('groups/reorder', 'POST', { ids: ['bad'] })).status, 200);
    assert.equal((await f.request('groups/reorder', 'POST', { ids: [123] })).status, 400);
  } finally { f.sql.close(); }
});

test('project deletion preserves contents and clears references in all child tables', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO projects (id,workspace_id,name,created_at) VALUES ('p','w','Project',0)");
    await f.request('tasks', 'POST', { title: 'Task', project_id: 'p' });
    await f.request('events', 'POST', { title: 'Event', start_at: 100, project_id: 'p' });
    await f.request('notes', 'POST', { title: 'Note', content: 'Text', project_id: 'p' });
    await f.request('resources', 'POST', { name: 'Link', url: 'https://example.com', project_id: 'p' });
    assert.equal((await f.request('projects/p', 'DELETE')).status, 200);
    for (const table of ['tasks','events','notes','resources']) {
      const rows = f.sql.prepare(`SELECT project_id FROM ${table}`).all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].project_id, null);
    }
  } finally { f.sql.close(); }
});

test('partial event updates cannot invert an interval', async () => {
  const f = fixture();
  try {
    await createEvent(f.db, { id:'e', workspace_id:'w', project_id:null, title:'Event', description:null, type:'event', start_at:100, end_at:200, all_day:0, color:null, location:null, url:null, created_at:0 });
    await assert.rejects(updateEvent(f.db, 'w', 'e', { start_at:300 }), /End must be after start/);
    await assert.rejects(updateEvent(f.db, 'w', 'e', { end_at:50 }), /End must be after start/);
    assert.equal(await updateEvent(f.db, 'w', 'e', { start_at:300, end_at:400 }), true);
    assert.equal(await updateEvent(f.db, 'w', 'e', { end_at:null }), true);
    assert.equal(await updateEvent(f.db, 'w', 'missing', {}), false);
  } finally { f.sql.close(); }
});

test('invalid timestamps are rejected without coercion or truncation', () => {
  for (const value of [true, [], {}, ' ', 1.5, Infinity, 9e15]) assert.throws(() => optionalInt(value, 'time'));
  assert.equal(optionalInt('123', 'time'), 123);
  assert.equal(optionalInt(0, 'time'), 0);
  assert.equal(optionalInt(null, 'time'), null);
});

test('failed upload metadata insert removes the stored file', async () => {
  const f = fixture();
  try {
    f.sql.exec("CREATE TRIGGER fail_resource BEFORE INSERT ON resources BEGIN SELECT RAISE(ABORT,'test failure'); END");
    const form = new FormData();
    form.set('file', new File(['%PDF-1.7'], 'test.pdf', { type:'application/pdf' }));
    const original = console.error;
    console.error = () => {};
    try { assert.equal((await f.request('files', 'POST', form)).status, 500); }
    finally { console.error = original; }
    assert.equal(f.objects.size, 0);
  } finally { f.sql.close(); }
});

test('tasks can link a resource from any tab in the workspace', async () => {
  const f = fixture();
  try {
    f.sql.exec("INSERT INTO projects (id,workspace_id,name,created_at) VALUES ('tab-a','w','Tab A',0),('tab-b','w','Tab B',0),('foreign-tab','other','Foreign',0)");
    const uploaded = await f.request('resources', 'POST', { type: 'url', name: 'Paper', url: 'https://example.com', project_id: 'tab-b' });
    const { resource } = await uploaded.json() as any;

    // Creating a task under tab A can still link a resource that lives under tab B.
    const created = await f.request('tasks', 'POST', { title: 'Read paper', project_id: 'tab-a', resource_id: resource.id });
    assert.equal(created.status, 201);
    const { task } = await created.json() as any;
    assert.equal(task.resource_id, resource.id);

    const fetched = f.sql.prepare('SELECT resource_id FROM tasks WHERE id = ?').get(task.id) as any;
    assert.equal(fetched.resource_id, resource.id);

    // A resource from a different workspace cannot be linked.
    f.sql.exec("INSERT INTO resources (id,workspace_id,name,type,url,created_at) VALUES ('foreign-res','other','Foreign','url','https://x',0)");
    assert.equal((await f.request('tasks', 'POST', { title: 'Bad link', resource_id: 'foreign-res' })).status, 400);
    assert.equal((await f.request('tasks', 'POST', { title: 'Missing link', resource_id: 'missing' })).status, 400);

    // Unlinking via PATCH.
    assert.equal((await f.request(`tasks/${task.id}`, 'PATCH', { resource_id: null })).status, 200);
    const unlinked = f.sql.prepare('SELECT resource_id FROM tasks WHERE id = ?').get(task.id) as any;
    assert.equal(unlinked.resource_id, null);
  } finally { f.sql.close(); }
});

test('resource marks: CRUD, validation, and cascade delete with the resource', async () => {
  const f = fixture();
  try {
    const created = await f.request('resources', 'POST', { type: 'url', name: 'Paper', url: 'https://example.com' });
    const { resource } = await created.json() as any;

    assert.equal((await f.request(`resources/${resource.id}/marks`, 'POST', { page_number: 0 })).status, 400);
    assert.equal((await f.request(`resources/missing/marks`, 'POST', { page_number: 1 })).status, 404);

    const markRes = await f.request(`resources/${resource.id}/marks`, 'POST', { page_number: 3, note: 'Check this figure' });
    assert.equal(markRes.status, 201);
    const { mark } = await markRes.json() as any;

    const listed = await (await f.request(`resources/${resource.id}/marks`)).json() as any;
    assert.equal(listed.marks.length, 1);
    assert.equal(listed.marks[0].note, 'Check this figure');

    assert.equal((await f.request(`resources/${resource.id}/marks/${mark.id}`, 'PATCH', { note: 'Updated' })).status, 200);
    const afterPatch = f.sql.prepare('SELECT note FROM resource_marks WHERE id = ?').get(mark.id) as any;
    assert.equal(afterPatch.note, 'Updated');

    assert.equal((await f.request(`resources/${resource.id}`, 'DELETE')).status, 200);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM resource_marks').get()!.n, 0);
  } finally { f.sql.close(); }
});

test('unlock accepts a valid password and rejects overlong passwords', async () => {
  const f = fixture();
  try {
    f.sql.prepare("UPDATE workspaces SET password_hash=? WHERE id='w'").run(await hashPassword('password'));
    const res = await f.request('unlock', 'POST', { password:'password' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie')!, /HttpOnly/);
    assert.equal((await f.request('unlock', 'POST', { password:'x'.repeat(1025) })).status, 400);
  } finally { f.sql.close(); }
});

test('missing admin secret fails closed', async () => {
  const f = fixture();
  try {
    delete f.env.ADMIN_SECRET;
    const res = await app.request('/api/admin/session', { headers: { cookie:'admin_session=e30.invalid' } }, f.env);
    assert.deepEqual(await res.json(), { authenticated:false });
  } finally { f.sql.close(); }
});

test('empty updates return 404 for missing records', async () => {
  const f = fixture();
  try {
    for (const path of ['projects','tasks','events','notes']) {
      assert.equal((await f.request(`${path}/missing`, 'PATCH', {})).status, 404);
    }
  } finally { f.sql.close(); }
});

test('note creation and editing preserve Markdown whitespace', async () => {
  const f = fixture();
  try {
    const content = '    code block\n\nline break  \n';
    const res = await f.request('notes', 'POST', { title:'Note', content });
    assert.equal(res.status, 201);
    const { note } = await res.json() as any;
    assert.equal(note.content, content);
    assert.equal((await f.request(`notes/${note.id}`, 'PATCH', { content:content + '\n' })).status, 200);
    const saved = await (await f.request(`notes/${note.id}`)).json() as any;
    assert.equal(saved.note.content, content + '\n');
  } finally { f.sql.close(); }
});

test('admin login still supports the secret header without a JSON body', async () => {
  const f = fixture();
  try {
    const res = await app.request('/api/admin/login', {
      method:'POST', headers:{ 'x-admin-secret':f.env.ADMIN_SECRET },
    }, f.env);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie')!, /admin_session=/);
  } finally { f.sql.close(); }
});

test('passkey availability reflects whether the workspace has any registered credentials', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await (await f.request('passkey/available')).json(), { available: false });

    f.sql.exec(`INSERT INTO passkey_credentials (id,workspace_id,name,public_key,algorithm,counter,created_at)
      VALUES ('cred1','w','Kai''s MacBook','unused','ES256',0,0)`);

    assert.deepEqual(await (await f.request('passkey/available')).json(), { available: true });
    // Scoped per workspace — a credential on 'w' doesn't make 'other' report available.
    const other = await app.request('/api/workspaces/other/passkey/available', {}, f.env);
    assert.deepEqual(await other.json(), { available: false });

    const options = await (await f.request('passkey/login-options', 'POST')).json() as any;
    assert.deepEqual(options.credentialIds, ['cred1']);
  } finally { f.sql.close(); }
});

test('passkey management: list omits secrets and delete is workspace-scoped', async () => {
  const f = fixture();
  try {
    f.sql.exec(`INSERT INTO passkey_credentials (id,workspace_id,name,public_key,algorithm,counter,created_at)
      VALUES ('cred1','w','Kai''s MacBook','super-secret-spki','ES256',3,0)`);
    f.sql.exec(`INSERT INTO passkey_credentials (id,workspace_id,name,public_key,algorithm,counter,created_at)
      VALUES ('cred2','other','Someone else''s key','other-secret','ES256',0,0)`);

    const { passkeys } = await (await f.request('passkeys')).json() as any;
    assert.equal(passkeys.length, 1);
    assert.deepEqual(Object.keys(passkeys[0]).sort(), ['created_at', 'id', 'last_used_at', 'name']);
    assert.equal(passkeys[0].name, "Kai's MacBook");

    // Can't delete another workspace's passkey through this one's route.
    assert.equal((await f.request('passkeys/cred2', 'DELETE')).status, 404);
    assert.equal((await f.request('passkeys/missing', 'DELETE')).status, 404);
    assert.equal((await f.request('passkeys/cred1', 'DELETE')).status, 200);
    assert.equal((await (await f.request('passkeys')).json() as any).passkeys.length, 0);
  } finally { f.sql.close(); }
});

test('passkey challenge tokens are single-purpose and workspace-bound', async () => {
  const f = fixture();
  try {
    // A registration token minted for workspace 'w' must not authenticate a login,
    // or register a credential on a different workspace.
    const { token } = await (await f.request('passkeys/register-options', 'POST')).json() as any;

    const wrongPurpose = await f.request('passkey/login', 'POST', {
      token, authentication: { id: 'x', response: {} },
    });
    assert.equal(wrongPurpose.status, 400);

    const otherToken = 'other-workspace-token';
    f.sql.prepare('INSERT OR REPLACE INTO workspace_sessions VALUES (?,?,?,?)')
      .run(await sha256Hex(otherToken), 'other', Date.now() + 60_000, 0);
    const wrongWorkspace = await app.request('/api/workspaces/other/passkeys/register', {
      method: 'POST',
      headers: { cookie: `workspace_session=${otherToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', token, registration: { id: 'x', response: {} } }),
    }, f.env);
    assert.equal(wrongWorkspace.status, 400);

    assert.equal((await f.request('passkeys/register', 'POST', { name: 'x' })).status, 400); // missing registration
    assert.equal((await f.request('passkeys/register', 'POST', { registration: {}, token })).status, 400); // missing name
  } finally { f.sql.close(); }
});
