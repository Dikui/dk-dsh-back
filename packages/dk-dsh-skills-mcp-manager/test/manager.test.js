import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { apply } from '../index.js';

// small/spec — requested removal of the upstream project and issue links.
test('Skills page has no upstream project or issue destinations', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /window\.open\("https:\/\/github\.com\/MichengAI\/dsh-skills-manager/);
});

// small/spec — keep page headings without introductory paragraphs.
test('Skills and MCP headings have no introductory paragraph', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('className:"dssm-desc"},e("desc")'));
  assert.ok(!source.includes("className: 'mcpm-desc', key: 'desc'"));
});

test('backend preserves independent plugin lifecycles and configuration', () => {
  const calls = [];
  const config = { skills: { gitTimeoutMs: 1000 }, mcp: { backupsToKeep: 30 } };
  apply({ plugin: (...args) => calls.push(args) }, config);
  assert.deepEqual(calls.map(([plugin, options]) => [plugin.name, options]), [
    ['skills-manager', config.skills], ['mcp-manager', config.mcp],
  ]);
  assert.ok(calls.every(([plugin]) => typeof plugin.apply === 'function' && plugin.inject.length));
});

test('built client registers only unified entry, keeps both pages and cleans up', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  let bundle;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { bundle = value; } } }, console });
  assert.equal(bundle.id, 'dk-dsh-skills-mcp-manager');
  let active = 'skills';
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: () => [active, value => { active = value; }],
  };
  const client = bundle.factory(name => {
    if (name === 'react') return react;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Input: () => null };
    throw new Error('Unexpected dependency: ' + name);
  });
  const entries = [], cleanups = [], dictionaries = [];
  const ctx = {
    effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    locale: { register: (ns) => { dictionaries.push(ns); return () => dictionaries.splice(dictionaries.indexOf(ns), 1); } },
    slots: {
      inject: (_name, fn) => { cleanups.push(fn()); },
      register: (meta, render) => { const entry = { meta, render }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1); },
    },
  };
  client.apply(ctx);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].meta.id, bundle.id);
  assert.equal(dictionaries.length, 2);
  const props = { useSessions: () => 'session' };
  const first = entries[0].render(props);
  assert.equal(first.children[2].props.hidden, false);
  assert.equal(first.children[3].props.hidden, true);
  assert.equal(first.children[2].children[0].props, props);
  assert.equal(typeof first.children[2].children[0].type, 'function');
  assert.equal(typeof first.children[3].children[0].type, 'function');
  first.children[1].children[1].props.onClick();
  const second = entries[0].render(props);
  assert.equal(second.children[2].props.hidden, true);
  assert.equal(second.children[3].props.hidden, false);
  assert.equal(second.children[3].children[0].props.__ctx, ctx);
  for (const cleanup of cleanups.reverse()) cleanup();
  assert.equal(entries.length, 0);
  assert.equal(dictionaries.length, 0);
});
