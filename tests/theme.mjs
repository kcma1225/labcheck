import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/frontend/lib/theme.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'theme', write: false });
const source = result.outputFiles[0].text;
const html = await readFile('index.html', 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function environment({ stored = null, dark = false, reduced = false, blocked = false, viewTransitions = false } = {}) {
  const classes = new Set();
  const mediaListeners = [];
  const storageListeners = [];
  const pending = [];
  const timers = new Map();
  let timerId = 0;
  const root = { dataset: {}, classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)) }, style: { setProperty() {} } };
  const meta = { content: '', setAttribute(_, value) { this.content = value; } };
  const localStorage = {
    getItem() { if (blocked) throw new Error('storage blocked'); return stored; },
    setItem(_, value) { if (blocked) throw new Error('storage blocked'); stored = value; },
  };
  const document = { documentElement: root, querySelector: () => meta };
  if (viewTransitions) document.startViewTransition = callback => {
    let finish;
    const transition = { callback, finished: new Promise(resolve => { finish = resolve; }), skipTransition() {}, finish: () => finish() };
    pending.push(transition);
    return transition;
  };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia(query) { return { matches: query.includes('reduced') ? reduced : dark, addEventListener(_, fn) { mediaListeners.push(fn); } }; },
    addEventListener(_, fn) { storageListeners.push(fn); },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  const context = vm.createContext({ window, document, localStorage });
  vm.runInContext(bootstrap, context);
  const prepaint = root.dataset.theme;
  vm.runInContext(source, context);
  const theme = context.theme;
  theme.initTheme();
  return {
    theme, root, meta, classes, pending, timers, prepaint,
    preference: () => stored,
    system(value) { dark = value; mediaListeners.forEach(fn => fn()); },
    storage(value, key = 'theme') { stored = value; storageListeners.forEach(fn => fn({ key })); },
    flushTimers() { [...timers.values()].forEach(fn => fn()); timers.clear(); },
  };
}

test('theme defaults to OS preference and follows changes', () => {
  const e = environment({ dark: true });
  assert.equal(e.prepaint, 'dark');
  assert.equal(e.theme.getThemePref(), 'system');
  e.system(false);
  assert.equal(e.theme.getResolvedTheme(), 'light');
  assert.equal(e.meta.content, '#f9fafb');
});

test('explicit preference wins over OS and persists the cycle', () => {
  const e = environment({ stored: 'light', dark: true });
  assert.equal(e.prepaint, 'light');
  assert.equal(e.theme.cycleThemePref(), 'dark');
  assert.equal(e.preference(), 'dark');
  assert.equal(e.meta.content, '#0c0e12');
  e.system(false);
  assert.equal(e.theme.getResolvedTheme(), 'dark');
  assert.equal(e.theme.cycleThemePref(), 'system');
  assert.equal(e.theme.getResolvedTheme(), 'light');
});

test('invalid or blocked storage follows OS without a light prepaint flash', () => {
  for (const options of [{ stored: 'invalid' }, { blocked: true }]) {
    const e = environment({ ...options, dark: true });
    assert.equal(e.prepaint, 'dark');
    assert.equal(e.theme.getResolvedTheme(), 'dark');
    assert.doesNotThrow(() => e.theme.setThemePref('light'));
    assert.equal(e.theme.getResolvedTheme(), 'light');
  }
});

test('cross-tab changes and cleared storage update the theme', () => {
  const e = environment({ stored: 'light', dark: true });
  e.storage('dark');
  assert.equal(e.theme.getThemePref(), 'dark');
  e.storage(null, null);
  assert.equal(e.theme.getThemePref(), 'system');
  assert.equal(e.theme.getResolvedTheme(), 'dark');
});

test('reduced motion skips transitions', () => {
  const e = environment({ reduced: true, viewTransitions: true });
  e.theme.setThemePref('dark', { x: 20, y: 20 });
  assert.equal(e.pending.length, 0);
  assert.equal(e.classes.size, 0);
  assert.equal(e.theme.getResolvedTheme(), 'dark');
});

test('fallback transition cleanup survives repeated switching', () => {
  const e = environment();
  e.theme.setThemePref('dark');
  e.theme.setThemePref('light');
  assert.equal(e.timers.size, 1);
  e.flushTimers();
  assert.equal(e.classes.size, 0);
});

test('asynchronous view transition notifies subscribers after applying theme', async () => {
  const e = environment({ viewTransitions: true });
  const snapshots = [];
  e.theme.subscribeTheme(() => snapshots.push(e.theme.getResolvedTheme()));
  e.theme.setThemePref('dark', { x: 20, y: 20 });
  assert.equal(e.theme.getResolvedTheme(), 'light');
  e.pending[0].callback();
  assert.equal(snapshots.at(-1), 'dark');
  e.pending[0].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.classes.size, 0);
});

test('stale transition callbacks cannot override the latest selection', async () => {
  const e = environment({ viewTransitions: true });
  e.theme.setThemePref('dark', { x: 20, y: 20 });
  e.theme.setThemePref('light', { x: 20, y: 20 });
  e.pending[0].callback();
  e.pending[0].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.theme.getResolvedTheme(), 'light');
  assert.equal(e.classes.size, 0);
});

test('theme buttons never submit their enclosing form', async () => {
  const source = await readFile('src/frontend/components/ThemeToggle.tsx', 'utf8');
  const buttons = source.match(/<button\b[^>]*>/g);
  assert.equal(buttons.length, 1);
  buttons.forEach(button => assert.match(button, /type="button"/));
});
