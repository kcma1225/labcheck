import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/worker/index';
import { sha256Hex, hashPassword } from '../src/worker/lib/crypto';
import { optionalInt } from '../src/worker/middleware/validation';
import { setWorkspacePassword } from '../src/worker/db/queries/workspaces';
import { createEvent, updateEvent } from '../src/worker/db/queries/events';
import type { ReactElement } from 'react';
import { ColorPicker } from '../src/frontend/components/ui';
import { COLOR_SWATCHES } from '../src/frontend/lib/colors';
import { duplicateGroup, reorder } from '../src/frontend/components/ManageTabsDialog';

test('management validates duplicate groups and reorders without dropping other groups or legacy tabs', () => {
  const groups = [{ id: 'a', name: 'Research' }, { id: 'b', name: 'Work' }] as any;
  assert.equal(duplicateGroup(groups, ' research '), true);
  assert.equal(duplicateGroup(groups, 'RESEARCH', 'a'), false);
  assert.equal(duplicateGroup(groups, 'New'), false);
  const tabs = [{ id: 'legacy' }, { id: 'a' }, { id: 'other' }, { id: 'b' }];
  assert.deepEqual(reorder(tabs, 'b', 'a'), ['legacy', 'b', 'a', 'other']);
  assert.deepEqual(reorder(tabs, 'missing', 'a'), tabs.map(t => t.id));
});

test('mobile color picker keeps palette, default and custom values without changing the swatch-only default', () => {
  for (const value of [null, ...COLOR_SWATCHES.map(c => c.hex), '#123456']) {
    let selected: string | null = value;
    const picker = ColorPicker({
      mobileSelect: true, label: 'Color for group Research', value, onChange: color => { selected = color; },
    });
    const [mobile, desktop] = picker.props.children as ReactElement<any>[];
    assert.match(mobile.props.className, /\bmd:hidden\b/);
    assert.equal(desktop.props.className, 'hidden md:block');
    const [preview, select] = mobile.props.children;
    assert.equal(preview.props['aria-hidden'], 'true');
    assert.equal(preview.props.style.backgroundColor, value ?? 'var(--color-white)');
    assert.equal(Boolean(preview.props.style.backgroundImage), value === null);
    assert.equal(select.props['aria-label'], 'Color for group Research');
    assert.equal(select.props.value, value ?? '');
    const [options, custom] = select.props.children;
    assert.deepEqual(options.map((option: ReactElement<any>) => [option.props.children, option.props.value]), COLOR_SWATCHES.map(c => [c.label, c.hex ?? '']));
    assert.equal(Boolean(custom), value === '#123456');
    if (custom) assert.equal(custom.props.value, value);
    select.props.onChange({ target: { value: '#22c55e' } });
    assert.equal(selected, '#22c55e');
    select.props.onChange({ target: { value: '' } });
    assert.equal(selected, null);
  }
  const swatches = ColorPicker({ value: null, onChange: () => {} });
  assert.equal(swatches.props.children.length, COLOR_SWATCHES.length);
  assert.ok(swatches.props.children.every((child: ReactElement) => child.type === 'button'));
});

test('group and tab dialogs opt into mobile colors and preserve group submission protections', () => {
  const manage = readFileSync('src/frontend/components/ManageTabsDialog.tsx', 'utf8');
  const create = readFileSync('src/frontend/components/NewTabDialog.tsx', 'utf8');
  const event = readFileSync('src/frontend/components/EventDialog.tsx', 'utf8');
  assert.equal((manage.match(/<ColorPicker\s+(?:compact\s+)?mobileSelect/g) ?? []).length, 2);
  assert.match(create, /<ColorPicker mobileSelect label="New tab color"/);
  assert.doesNotMatch(event, /mobileSelect/);
  assert.match(manage, /if \(pending.current \|\| !name\) return/);
  assert.match(manage, /e\.nativeEvent\.isComposing \|\| e\.keyCode === 229/);
  assert.match(manage, /\{ name, color: newGroupColor \}/);
  assert.match(manage, /if \(ok\) \{\s*setNewGroupName\(""\);\s*setNewGroupColor\(null\);\s*setCreatingGroup\(false\);\s*\}/);
  assert.match(manage, /disabled=\{busy\}/);
  assert.match(create, /!group.id.trim\(\)/);
  assert.match(create, /group_id: group.id/);
  assert.doesNotMatch(create, /<Modal|<Select|group_id:.*null/);
  assert.match(manage, /projects.filter\(p => p.group_id === selected\)/);
  assert.match(manage, /creatingTab && group \? <NewTabForm/);
  assert.match(manage, /ungrouped.length > 0/);
});

test('group creation persists palette and default colors', async () => {
  const f = fixture();
  try {
    for (const [index, color] of ['#3b82f6', null].entries()) {
      const res = await f.request('groups', 'POST', { name: `Colored group ${index}`, color });
      assert.equal(res.status, 201);
      const { group } = await res.json() as any;
      assert.equal(group.color, color);
      assert.equal(f.sql.prepare('SELECT color FROM groups WHERE id = ?').get(group.id)!.color, color);
    }
  } finally { f.sql.close(); }
});

test('workspace actions remain accessible in the mobile menu and desktop sidebar', () => {
  const layout = readFileSync('src/frontend/components/Layout.tsx', 'utf8');
  const header = layout.match(/<Header\b[\s\S]*?\} \/>/)![0];
  const aside = layout.match(/<aside\b[\s\S]*?<\/aside>/)![0];
  assert.match(header, /md:hidden/);
  assert.doesNotMatch(header, /ThemeToggleIcon/);
  assert.doesNotMatch(header, /GhostButton|button|aria-expanded/);
  assert.match(layout, />Manage<\/GhostButton>/);
  assert.doesNotMatch(layout, /setCreatingTab|NewTabDialog|New tab/);
  assert.match(layout, /launch\(\(\) => setManaging\(true\)\)/);
  assert.match(layout, /launch\(\(\) => setManagingPasskeys\(true\)\)/);
  const asideButtons = aside.match(/<GhostButton\b[\s\S]*?<\/GhostButton>/g) ?? [];
  const manageButtons = asideButtons.filter(button => button.includes('aria-label="Manage"'));
  assert.equal(manageButtons.length, 1);
  assert.ok(manageButtons[0].includes('onClick={() => setManaging(true)}'));
  assert.ok(manageButtons[0].includes('title="Manage"'));
  assert.match(manageButtons[0], /<Icon name="manage"/);
  const controls = layout.match(/const workspaceControls = \([\s\S]*?\n  \);/)![0];
  const lockButtons = controls.match(/<GhostButton\b[\s\S]*?<\/GhostButton>/g) ?? [];
  assert.equal(lockButtons.filter(button => button.includes('aria-label="Lock workspace"')).length, 1);
  assert.match(controls, /onClick=\{lock\}[\s\S]*title="Lock workspace"[\s\S]*<Icon name="lock"/);
  const desktopActions = [...aside.matchAll(/<div className="hidden[^"\n]*md:flex">([\s\S]*?)<\/div>/g)].map(match => match[1]);
  assert.equal(desktopActions.length, 2);
  assert.match(desktopActions[0], /<ThemeToggleIcon\s*\/>/);
  assert.doesNotMatch(desktopActions[0], /Lock workspace/);
  assert.match(desktopActions[1], /aria-label="Manage"/);
  assert.equal((layout.match(/onClick=\{lock\}/g) ?? []).length, 1);
  assert.ok(controls.lastIndexOf('Lock workspace') > controls.lastIndexOf('Passkeys'));
  assert.match(aside, /\{!mobile && workspaceControls\}/);
  assert.match(layout, /launch\(lock\)/);
  assert.equal((layout.match(/workspace-lock/g) ?? []).length, 2);
  assert.match(layout, /\{managing && \(\s*<ManageTabsDialog/);
  const manage = readFileSync('src/frontend/components/ManageTabsDialog.tsx', 'utf8');
  assert.match(manage, /placeholder="New group name"/);
  assert.match(manage, /void addGroup\(\)/);
  const ui = readFileSync('src/frontend/components/ui.tsx', 'utf8');
  assert.match(ui, /lock: <path d="[^"]+"/);
});

test('mobile bottom navigation uses shared modal sheets and restores desktop navigation', () => {
  const layout = readFileSync('src/frontend/components/Layout.tsx', 'utf8');
  const ui = readFileSync('src/frontend/components/ui.tsx', 'utf8');
  const css = readFileSync('src/frontend/index.css', 'utf8');
  assert.match(layout, /const mobile = useMobileThemeOverride\(\)/);
  assert.match(layout, /aria-label="Mobile workspace navigation"[^\n]*fixed inset-x-0 bottom-0[^\n]*grid-cols-3/);
  for (const name of ['tabs', 'menu']) {
    assert.ok(layout.includes(`aria-expanded={sheet === "${name}"}`));
    assert.ok(layout.includes(`aria-controls="workspace-${name}-sheet"`));
  }
  assert.match(layout, /aria-current=\{activeProjectId \? "true" : undefined\}/);
  assert.match(layout, /\[location.key, mobile\]/);
  assert.match(layout, /mobile && sheet &&/);
  assert.match(layout, /flushSync\(\(\) => setSheet\(null\)\);[\s\S]*workspace-menu-sheet[\s\S]*action\(\)/);
  assert.match(layout, /pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.doesNotMatch(layout, /menuOpen|grid-rows|Open workspace menu/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /sibling.inert = true/);
  assert.match(ui, /element.inert = false/);
  assert.match(ui, /event.key === "Escape"/);
  assert.match(ui, /event.key === "Tab"/);
  assert.match(ui, /previous\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /workspace-menu-sheet.*#workspace-navigation a/);
  assert.match(ui, /document.body.style.overflow = overflow/);
  assert.match(ui, /max-h-\[calc\(100dvh/);
  assert.match(ui, /min-h-0 overflow-y-auto overscroll-contain/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /sheet-enter/);
  assert.match(ui, /panel\.animate\(\s*\[\{ transform: "translateY\(100%\)" \}, \{ transform: "translateY\(0\)" \}\]/);
  assert.match(ui, /prefers-reduced-motion: reduce/);
});

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

test('title-only notes default to empty content and validate explicit content', async () => {
  const f = fixture();
  try {
    const res = await f.request('notes', 'POST', { title: '  Title only  ' });
    assert.equal(res.status, 201);
    const { note } = await res.json() as any;
    assert.equal(note.title, 'Title only');
    assert.equal(note.content, '');
    assert.equal((await (await f.request(`notes/${note.id}`)).json() as any).note.content, '');
    for (const content of [null, false, 42, {}, [], 'x'.repeat(100001)]) {
      assert.equal((await f.request('notes', 'POST', { title: 'Invalid', content })).status, 400);
      assert.equal((await f.request(`notes/${note.id}`, 'PATCH', { content })).status, 400);
    }
    for (const content of ['', ' \n\t ', 'x'.repeat(100000)]) {
      const created = await f.request('notes', 'POST', { title: 'Valid', content });
      assert.equal(created.status, 201);
      const body = await created.json() as any;
      assert.equal((await (await f.request(`notes/${body.note.id}`)).json() as any).note.content, content);
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

test('resource dialog defaults to file upload with file-first ordering', () => {
  const source = readFileSync('src/frontend/components/ResourcesPanel.tsx', 'utf8');
  assert.match(source, /useState<Tab>\("file"\)/);
  assert.match(source, /\["file", "link"\]/);
  assert.match(source, /\{t === "link" \? "Add link" : "Upload file"\}/);
});

test('tasks filter is a native select preserving options, value and status query', () => {
  const source = readFileSync('src/frontend/components/TasksPanel.tsx', 'utf8');
  assert.match(source, /useState<TaskStatus \| "all">\("all"\)/);
  assert.match(source, /<select[^>]*aria-label="Filter tasks"/);
  assert.match(source, /value=\{filter\}/);
  assert.match(source, /onChange=\{\(e\) => setFilter\(e\.target\.value as TaskStatus \| "all"\)\}/);
  assert.match(source, /<option key=\{f\.key\} value=\{f\.key\}>/);
  for (const [key, label, cardTitle] of [['all', 'All', 'All tasks'], ['todo', 'Todo', 'Not started'], ['doing', 'Doing', 'Progressing'], ['done', 'Done', 'Done']]) {
    assert.ok(source.includes(`key: "${key}"`), key);
    assert.ok(source.includes(`label: "${label}"`), label);
    assert.ok(source.includes(`cardTitle: "${cardTitle}"`), cardTitle);
  }
  assert.match(source, /filter === "all" \? "" : `&status=\$\{filter\}`/);
  assert.match(source, /title=\{FILTERS\.find\(\(f\) => f\.key === filter\)\?\.cardTitle\}/);
  assert.doesNotMatch(source, /setFilter\(f\.key\)/);
  assert.match(source, /w-auto min-w-0 max-w-full/);
  assert.match(source, /New task/);
});

test('workspace navigation uses border-only active states without high-contrast fills', () => {
  const layout = readFileSync('src/frontend/components/Layout.tsx', 'utf8');
  assert.doesNotMatch(layout, /bg-gray-900 text-white/);
  assert.doesNotMatch(layout, /text-gray-900 bg-gray-100/);
  assert.match(layout, /border-gray-900 text-gray-900/);
  assert.match(layout, /border-transparent text-gray-700 hover:bg-gray-100/);
  assert.match(layout, /border-transparent text-gray-500/);
  assert.match(layout, /rounded border px-3 py-2 text-sm/);
  assert.match(layout, /rounded border px-3 py-2 text-sm md:min-h-0/);
  assert.match(layout, /border-t-2 text-xs font-medium focus-visible:outline/);
  assert.match(layout, /aria-current=\{p\.id === activeProjectId \? "page" : undefined\}/);
  assert.match(layout, /aria-current=\{activeProjectId \? "true" : undefined\}/);
  assert.match(layout, /focus-visible:outline/);
});

test('mobile calendar renders compact weekly spanning bars and preserves day overflow modal and desktop lanes', () => {
  const calendar = readFileSync('src/frontend/components/CalendarMonth.tsx', 'utf8');
  assert.match(calendar, /const mobile = useMobileThemeOverride\(true\)/);
  assert.match(calendar, /const MAX_MOBILE_LANES = 2/);
  assert.match(calendar, /calendar-grid-mobile/);
  assert.match(calendar, /gridColumn: `\$\{bar\.colStart \+ 1\} \/ \$\{bar\.colEnd \+ 2\}`/);
  assert.match(calendar, /bars\.push\(\{ event, colStart, colEnd, lane, startsHere:/);
  assert.match(calendar, /lastCoveredMs\(event\)/);
  assert.match(calendar, /overflow\.map\(\(count, di\)/);
  assert.match(calendar, /setSelectedDay\(week\[di\]\)/);
  assert.match(calendar, /selectedDay && <Modal/);
  assert.match(calendar, /gridTemplateRows: `1\.75rem repeat\(\$\{laneRows\}/);
  assert.match(calendar, /overflow-x-auto/);
  assert.match(calendar, /min-w-\[35rem\]/);
});

test('mobile project controls and task detail behavior stay compact while actions remain available in centered dialogs', () => {
  const project = readFileSync('src/frontend/pages/ProjectPage.tsx', 'utf8');
  const tasks = readFileSync('src/frontend/components/TasksPanel.tsx', 'utf8');
  const events = readFileSync('src/frontend/components/EventInfoPopover.tsx', 'utf8');
  const ui = readFileSync('src/frontend/components/ui.tsx', 'utf8');
  const layout = readFileSync('src/frontend/components/Layout.tsx', 'utf8');
  assert.match(project, /grid w-full grid-cols-3[^"]*text-center[^"]*md:inline-flex md:w-auto/);
  assert.match(tasks, /onClick=\{mobile \? \(\) => setEditing\(t\) : undefined\}/);
  assert.match(tasks, /!mobile && \(\(\) => \{/);
  assert.match(tasks, /!mobile && <button[\s\S]*aria-label="Edit task"/);
  assert.match(tasks, /!mobile && <button[\s\S]*aria-label="Delete task"/);
  for (const field of ['Title', 'Description (optional)', 'Status', 'Assignee (optional)', 'Due (optional)', 'Resource (optional)']) assert.ok(tasks.includes(`label="${field}"`));
  assert.match(tasks, /<Modal open centered/);
  assert.match(tasks, /Delete task/);
  assert.match(events, /<Modal\s+open=\{open\}\s+centered/);
  assert.match(ui, /centered\?: boolean/);
  assert.match(ui, /centered \? "items-center" : "items-start"/);
  const menu = layout.match(/sheet === "tabs"[\s\S]*?<\/Modal>/)![0];
  assert.ok(menu.lastIndexOf('Lock workspace') > menu.lastIndexOf('{workspaceControls}'));
});

test('mobile-only floating New event button sits above the bottom nav and desktop keeps the inline button', () => {
  const dashboard = readFileSync('src/frontend/pages/Dashboard.tsx', 'utf8');
  assert.match(dashboard, /const mobile = useMobileThemeOverride\(true\)/);
  assert.match(dashboard, /!mobile && \(\s*<Button onClick=\{\(\) => cal\.openCreate\(\)\}>/);
  assert.match(dashboard, /\{mobile && \(\s*<button[\s\S]*?aria-label="New event"/);
  assert.match(dashboard, /fixed z-30 flex h-14 w-14 items-center justify-center rounded-full/);
  assert.match(dashboard, /calc\(5rem \+ env\(safe-area-inset-bottom\) \+ 1rem\)/);
  assert.match(dashboard, /calc\(1rem \+ env\(safe-area-inset-right\)\)/);
});

test('mobile task rows use a compact accessible status dot while desktop keeps status select', () => {
  const tasks = readFileSync('src/frontend/components/TasksPanel.tsx', 'utf8');
  assert.doesNotMatch(tasks, /type="checkbox"/);
  assert.match(tasks, /mobile \? \(\s*<span\s+role="img"/);
  assert.match(tasks, /aria-label=\{`Status: \$\{STATUS_LABEL\[t\.status\]\}`\}/);
  assert.match(tasks, /h-2\.5 w-2\.5 shrink-0 rounded-full/);
  assert.match(tasks, /bg-gray-400[\s\S]*bg-amber-400[\s\S]*bg-green-500/);
  assert.match(tasks, /\) : \(\s*<select\s+value=\{t\.status\}/);
  assert.match(tasks, /onChange=\{\(e\) => patch\(t\.id, \{ status: e\.target\.value as TaskStatus \}\)\}/);
});

test('mobile project navigation cells center labels with touch height and retain compact desktop height', () => {
  const project = readFileSync('src/frontend/pages/ProjectPage.tsx', 'utf8');
  assert.match(project, /flex min-h-11 items-center justify-center rounded-md[^"]*md:min-h-0/);
});

test('new tab subview shows only compact group context and group arrows stay centered', () => {
  const manage = readFileSync('src/frontend/components/ManageTabsDialog.tsx', 'utf8');
  const create = readFileSync('src/frontend/components/NewTabDialog.tsx', 'utf8');
  assert.doesNotMatch(manage, /New tab ·/);
  assert.doesNotMatch(create, /Create a tab in/);
  assert.match(create, /tabColor\(group\)/);
  assert.match(create, /\{group\.name\}/);
  assert.match(manage, /aria-hidden="true" className="shrink-0 self-center">→/);
});

test('note mode toggle buttons render distinct active vs inactive classes', () => {
  const notes = readFileSync('src/frontend/components/NotesPanel.tsx', 'utf8');
  assert.match(notes, /mode === value \? "!border-gray-900 !text-gray-900" : "!border-transparent !text-gray-700"/);
  assert.match(notes, /aria-pressed=\{mode === value\}/);
});

test('New group opens a subview on all screens with the same stacked fields as New tab', () => {
  const manage = readFileSync('src/frontend/components/ManageTabsDialog.tsx', 'utf8');
  assert.match(manage, /const \[creatingGroup, setCreatingGroup\] = useState\(false\)/);
  assert.match(manage, /<Button onClick=\{\(\) => setCreatingGroup\(true\)\} disabled=\{busy\}><Icon name="plus" \/>New group<\/Button>/);
  assert.match(manage, /const newGroupForm = \(/);
  const formBody = manage.match(/const newGroupForm = \([\s\S]*?\);\n\n  return/)![0];
  const colorIndex = formBody.indexOf('<ColorPicker');
  const nameIndex = formBody.indexOf('label="Name"');
  assert.ok(colorIndex > -1 && nameIndex > -1 && nameIndex < colorIndex, 'name field must precede the color picker');
  assert.match(formBody, /className="space-y-4"/);
  assert.match(formBody, /<span className="mb-1 block text-xs font-medium text-gray-600">Color<\/span>/);
  assert.doesNotMatch(formBody, /flex items-start/);
  assert.doesNotMatch(manage, /\{!mobile && newGroupForm\}|\{mobile \? <Button/);
  assert.match(manage, /creatingGroup \? newGroupForm/);
  assert.doesNotMatch(manage, /Choose a group to manage|Create a group to organize/);
  assert.match(manage, /creatingTab \|\| creatingGroup \? "sr-only"/);
  assert.match(manage, /flex items-center justify-between gap-3[\s\S]*>Groups<[\s\S]*>New group</);
  assert.equal((manage.match(/<Modal\b/g) ?? []).length, 1);
});

test('shared Header brand-links Home, Layout and admin console back to \'\/\'', () => {
  const header = readFileSync('src/frontend/components/Header.tsx', 'utf8');
  assert.match(header, /<Link to="\/"[\s\S]*?labCheck/);
  assert.match(header, /export function BrandLink/);
  assert.match(header, /export function Header/);

  const home = readFileSync('src/frontend/pages/Home.tsx', 'utf8');
  assert.match(home, /import \{ Header \} from "..\/components\/Header"/);
  assert.match(home, /<Header end=\{/);

  const layout = readFileSync('src/frontend/components/Layout.tsx', 'utf8');
  assert.match(layout, /import \{ BrandLink, Header \} from "\.\/Header"/);
  assert.equal((layout.match(/<BrandLink/g) ?? []).length, 1);
  assert.match(layout, /<Header className="bg-white md:hidden" end=\{/);
  assert.match(header, /h-\[4\.25rem\].*px-4 py-3 sm:h-\[5\.25rem\] sm:py-5/);
  assert.match(header, /<BrandLink \/>/);

  const admin = readFileSync('src/frontend/pages/AdminCreateWorkspace.tsx', 'utf8');
  assert.match(admin, /import \{ Header \} from "..\/components\/Header"/);
  assert.match(admin, /<Header end=\{/);
});

test('admin console follows OS theme on mobile/PWA, matching the Home pattern exactly', () => {
  const admin = readFileSync('src/frontend/pages/AdminCreateWorkspace.tsx', 'utf8');
  assert.match(admin, /const systemTheme = useMobileThemeOverride\(true\)/);
  assert.match(admin, /\{!systemTheme && <ThemeToggleIcon \/>\}/);
});
