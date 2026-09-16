import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const result = await build({
  entryPoints: ['src/frontend/pages/Home.tsx'], bundle: true, platform: 'browser', format: 'iife', globalName: 'home', write: false,
  plugins: [{ name: 'home-fixtures', setup(build) {
    build.onResolve({ filter: /react-router-dom|\/api\/client|\/hooks\/useAsync|\/hooks\/useTheme|\/components\/PwaControls|\/components\/ThemeToggle/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'react-router-dom'
      ? 'export const Link = ({to, children, ...props}) => globalThis.React.createElement("a", {...props, href: to}, children);'
      : args.path.endsWith('useAsync') ? 'export const useAsync = () => globalThis.state;'
      : args.path.endsWith('useTheme') ? 'export const useMobileThemeOverride = () => globalThis.mobile;'
      : args.path.endsWith('PwaControls') ? 'export const InstallButton = () => null;'
      : args.path.endsWith('ThemeToggle') ? 'export const ThemeToggleIcon = () => globalThis.React.createElement("button", null, "Theme");'
      : 'export const api = {};', loader: 'js' }));
  } }],
});
function render(state, mobile = false) {
  const context = vm.createContext({ React, state, mobile });
  vm.runInContext(result.outputFiles[0].text, context);
  return renderToStaticMarkup(React.createElement(context.home.Home));
}

test('home distinguishes loading, empty and retryable errors', () => {
  assert.match(render({ loading: true }), /Loading workspaces/);
  assert.match(render({ loading: false, data: { workspaces: [] } }), /No workspaces yet/);
  const html = render({ error: 'offline', reload() {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /No workspaces yet/);
});

test('home exposes workspace links and Admin without private metadata', () => {
  const html = render({ data: { workspaces: [{ id: 'lab-1', name: 'Long research & development team' }] } });
  assert.match(html, /href="\/w\/lab-1"/);
  assert.match(html, /aria-label="Open Long research &amp; development team"/);
  assert.match(html, /href="\/admin\/create-workspace"/);
  assert.match(html, />Admin</);
  assert.match(html, /labCheck/);
});

test('home hides manual theme only when the scoped system override is active', () => {
  assert.match(render({ loading: true }), />Theme</);
  const html = render({ loading: true }, true);
  assert.doesNotMatch(html, />Theme</);
  assert.match(html, />Admin</);
});

const hookBuild = await build({
  entryPoints: ['src/frontend/hooks/useTheme.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'hooks', write: false,
  plugins: [{ name: 'hook-fixtures', setup(build) {
    build.onResolve({ filter: /^react$|\/lib\/theme$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'react'
      ? 'export const useState = fn => [fn(), value => globalThis.active = value]; export const useLayoutEffect = fn => { globalThis.cleanup = fn(); }; export const useSyncExternalStore = () => "system:light";'
      : 'export const setMobileThemeOverride = value => { globalThis.override = value; }; export const cycleThemePref = () => {}; export const getResolvedTheme = () => "light"; export const getThemePref = () => "system"; export const setThemePref = () => {}; export const subscribeTheme = () => {};', loader: 'js' }));
  } }],
});

test('home override tracks mobile, standalone, iOS and cleans up without extending workspace scope', () => {
  for (const includeStandalone of [true, false]) {
    const media = new Map();
    const events = new Map();
    const navigator = { standalone: false };
    const window = { navigator, matchMedia(query) {
      if (!media.has(query)) media.set(query, { matches: false, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } });
      return media.get(query);
    }, addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } };
    const context = vm.createContext({ window });
    vm.runInContext(hookBuild.outputFiles[0].text, context);
    context.hooks.useMobileThemeOverride(includeStandalone);
    assert.equal(context.override, false);
    const mobile = media.get('(width < 768px)');
    mobile.matches = true;
    mobile.listeners.forEach(fn => fn());
    assert.equal(context.override, true);
    mobile.matches = false;
    mobile.listeners.forEach(fn => fn());
    assert.equal(context.override, false);
    if (includeStandalone) {
      const standalone = media.get('(display-mode: standalone)');
      standalone.matches = true;
      standalone.listeners.forEach(fn => fn());
      assert.equal(context.override, true);
      standalone.matches = false;
      standalone.listeners.forEach(fn => fn());
      assert.equal(context.override, false);
    }
    navigator.standalone = true;
    events.get('pageshow')();
    assert.equal(context.override, includeStandalone);
    context.cleanup();
    assert.equal(context.override, false);
    assert.equal(events.size, 0);
    for (const query of media.values()) assert.equal(query.listeners.size, 0);
  }
});
