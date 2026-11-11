import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, rm, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecursiveSkillProvider, apply } from '../recursive-skills.js';
import { scanEntries } from '../vendor/skills/lib/core.js';
import { discoverReadonlyEntries } from '../vendor/skills/lib/readonly-discovery.js';

const body = name => `---\nname: ${name}\ndescription: Test skill\ndisable-model-invocation: true\n---\nHello ${name}`;

// small/regression — merged runtime and Manager must discover the same nested files.
test('runtime and Manager share recursive discovery with live invalidation', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dk-skills-'));
  const root = join(temp, 'skills');
  const controller = new AbortController();
  let invalidate;
  let provider;
  const warnings = [];
  const ctx = { get: () => undefined, logger: { warn: message => warnings.push(message) } };
  async function put(path, content) {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  try {
    await put(join(root, 'flat.md'), body('flat'));
    await put(join(root, 'dev', 'testing', 'foo', 'SKILL.md'), body('foo'));
    await put(join(root, 'dev', 'testing', 'foo', 'references', 'hidden.md'), body('hidden'));
    await put(join(root, 'dev', 'bar.md'), body('bar'));
    await put(join(root, '.system', 'skip.md'), body('skip'));
    await put(join(root, 'node_modules', 'skip.md'), body('skip'));
    await put(join(root, 'invalid', 'SKILL.md'), 'No frontmatter');
    await put(join(root, 'foo..md'), body('bad-entry-key'));
    await symlink(root, join(root, 'dev', 'cycle'));
    provider = new RecursiveSkillProvider(ctx, {
      signal: controller.signal, invalidate: () => invalidate?.(),
    }, {
      providerName: 'dsh-skills-manager-recursive', includeDefaultRoots: false,
      customSkillDirs: [root, join(temp, 'not-created')],
      watchStabilityThresholdMs: 10, watchPollIntervalMs: 10,
    });
    const candidates = await provider.list({});
    assert.deepEqual(candidates.map(x => x.name).sort(), ['bar', 'flat', 'foo']);
    const management = await scanEntries({ key: 'custom:test', path: root, mutable: false });
    assert.ok(management.entries.some(x => !x.loadable));
    assert.deepEqual(management.entries.filter(x => x.loadable).map(x => x.declaredName).sort(), candidates.map(x => x.name).sort());
    const bar = candidates.find(x => x.name === 'bar');
    assert.equal(bar.resourceBase.path, join(root, 'dev'));
    const foo = candidates.find(x => x.name === 'foo');
    assert.equal(foo.rank, 300.5);
    const loaded = await provider.get(foo, {});
    assert.equal(loaded.content, 'Hello foo');
    assert.equal(loaded.invocation.modelInvocable, false);
    assert.equal(loaded.resourceBase.path, join(root, 'dev', 'testing', 'foo'));
    async function changed(action) {
      let timer;
      const notice = new Promise((resolve, reject) => {
        invalidate = resolve;
        timer = setTimeout(() => reject(new Error('watcher did not invalidate')), 5000);
      });
      try { await action(); await notice; }
      finally { clearTimeout(timer); invalidate = undefined; }
    }
    await changed(() => writeFile(foo.locator.path, body('foo') + '\nUpdated'));
    assert.match((await provider.get(foo, {})).content, /Updated/);
    await changed(() => put(join(root, 'dev', 'new-category', 'deep', 'new', 'SKILL.md'), body('new')));
    assert.ok((await provider.list({})).some(x => x.name === 'new'));
    await changed(() => put(join(temp, 'not-created', 'late.md'), body('late')));
    assert.ok((await provider.list({})).some(x => x.name === 'late'));
    await changed(() => rm(foo.locator.path));
    assert.ok(!(await provider.list({})).some(x => x.name === 'foo'));
    assert.ok(warnings.length > 0 && warnings.every(message => message.includes('invalid/SKILL.md') && message.includes('missing YAML')));
  } finally {
    await provider?.dispose();
    controller.abort();
    // temp is the exact directory returned by mkdtemp, never a user-supplied path.
    assert.ok(temp.startsWith(join(tmpdir(), 'dk-skills-')));
    await rm(temp, { recursive: true, force: true });
  }
});

// small/spec — filesystem access denial never falls back to raw host reads.
test('filesystem policy denial is propagated without host fallback', async () => {
  const controller = new AbortController();
  const denied = Object.assign(new Error('denied'), { code: 'FS_ACCESS_DENIED' });
  const provider = new RecursiveSkillProvider({
    get: () => ({ resolve: async () => { throw denied; } }),
    logger: { warn() {} },
  }, { signal: controller.signal, invalidate() {} }, {
    includeDefaultRoots: false, customSkillDirs: ['/denied'], watch: false,
  });
  try { await assert.rejects(provider.list({}), error => error === denied); }
  finally { await provider.dispose(); controller.abort(); }
});

// small/spec — the built-in provider owns and disposes its watchers.
test('plugin registers and disposes its provider', async () => {
  let provider, dispose, observed;
  const controller = new AbortController();
  apply({
    get: () => undefined, logger: { warn() {} },
    skills: { registerProvider(create) { provider = create({ signal: controller.signal, invalidate() {} }); } },
    effect(create) { dispose = create(); },
    on(event, handler) { assert.equal(event, 'fs/observed'); observed = handler; },
  }, { includeDefaultRoots: false, watch: false });
  assert.equal(provider.name, 'dsh-skills-manager-recursive');
  assert.deepEqual(await provider.list({}), []);
  observed({ displayPath: '/unrelated/file' }, undefined, { name: 'write' });
  await dispose();
  controller.abort();
});

// small/spec — shared depth limit and root bundles cannot leak their resources as skills.
test('shared depth limit reports incomplete discovery without loading deeper skills', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dk-shared-skills-')));
  const controller = new AbortController();
  const provider = new RecursiveSkillProvider({ get: () => undefined, logger: { warn() {} } }, {
    signal: controller.signal, invalidate() {},
  }, { includeDefaultRoots: false, customSkillDirs: [temp], watch: false });
  try {
    const atLimit = join(temp, 'a/b/c/d/e/f');
    await mkdir(join(atLimit, 'deeper'), { recursive: true });
    await writeFile(join(atLimit, 'limit.md'), body('limit'));
    await writeFile(join(atLimit, 'deeper/hidden.md'), body('hidden'));
    const inventory = await discoverReadonlyEntries(temp);
    const runtime = await provider.list({});
    assert.equal(inventory.truncated, true);
    assert.equal(runtime.complete, false);
    assert.deepEqual(runtime.candidates.map(x => x.name), ['limit']);
    const manager = await scanEntries({ key: 'custom:test', path: temp, mutable: false });
    assert.deepEqual(manager.entries.map(x => x.declaredName), ['limit']);
    await writeFile(join(temp, 'SKILL.md'), body('root-bundle'));
    const rootBundle = await provider.list({});
    assert.deepEqual(rootBundle.map(x => x.name), ['root-bundle']);
    assert.deepEqual((await discoverReadonlyEntries(temp)).entries.map(x => x.name), ['.']);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(provider.list({ signal: aborted.signal }), { name: 'AbortError' });
  } finally {
    await provider.dispose();
    controller.abort();
    await rm(temp, { recursive: true, force: true });
  }
});

// small/spec — substitute only the host filesystem service, not its authorization boundary.
test('authorized filesystem discovery loads nested files and rejects denied children', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dk-authorized-skills-')));
  const controller = new AbortController();
  const denied = Object.assign(new Error('denied'), { code: 'FS_ACCESS_DENIED' });
  let denyChild = false;
  const fileSystem = {
    resolve: async path => {
      if (denyChild && path.endsWith('blocked.md')) throw denied;
      return { displayPath: path };
    },
    listDir: async target => readdir(target.displayPath, { withFileTypes: true }),
    stat: async target => ({ type: (await stat(target.displayPath)).isDirectory() ? 'directory' : 'file' }),
    processPath: target => target.displayPath,
    readText: async target => readFile(target.displayPath, 'utf8'),
  };
  const provider = new RecursiveSkillProvider({ get: () => fileSystem, logger: { warn() {} } }, {
    signal: controller.signal, invalidate() {},
  }, { includeDefaultRoots: false, customSkillDirs: [temp], watch: false });
  try {
    await mkdir(join(temp, 'group'));
    await writeFile(join(temp, 'group/allowed.md'), body('allowed'));
    assert.deepEqual((await provider.list({})).map(x => x.name), ['allowed']);
    await writeFile(join(temp, 'blocked.md'), body('blocked'));
    denyChild = true;
    await assert.rejects(provider.list({}), error => error === denied);
  } finally {
    await provider.dispose();
    controller.abort();
    await rm(temp, { recursive: true, force: true });
  }
});

// small/regression — attach watches before parsing the content returned to the catalog.
test('watch installation precedes content reads', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dk-watch-order-')));
  const controller = new AbortController();
  const provider = new RecursiveSkillProvider({ get: () => undefined, logger: { warn() {} } }, {
    signal: controller.signal, invalidate() {},
  }, { includeDefaultRoots: false, customSkillDirs: [temp], watch: false });
  try {
    await writeFile(join(temp, 'skill.md'), body('before'));
    // Simulate a file changing while watcher initialization is in flight.
    provider.watchManager.observeRoots = async () => writeFile(join(temp, 'skill.md'), body('after'));
    assert.deepEqual((await provider.list({})).map(x => x.name), ['after']);
  } finally {
    await provider.dispose();
    controller.abort();
    await rm(temp, { recursive: true, force: true });
  }
});
