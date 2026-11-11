import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecursiveSkillProvider, apply } from '../index.js';

const body = name => `---\nname: ${name}\ndescription: Test skill\ndisable-model-invocation: true\n---\nHello ${name}`;

test('real filesystem provider: recursion, resources, precedence, cycles and live invalidation', async () => {
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
    await symlink(root, join(root, 'dev', 'cycle'));
    provider = new RecursiveSkillProvider(ctx, {
      signal: controller.signal, invalidate: () => invalidate?.(),
    }, {
      providerName: 'dk-recursive-skills', includeDefaultRoots: false,
      customSkillDirs: [root, join(temp, 'not-created')],
      watchStabilityThresholdMs: 10, watchPollIntervalMs: 10,
    });
    const candidates = await provider.list({});
    assert.deepEqual(candidates.map(x => x.name).sort(), ['bar', 'flat', 'foo']);
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
    assert.deepEqual(warnings, []);
  } finally {
    await provider?.dispose();
    controller.abort();
    // temp is the exact directory returned by mkdtemp, never a user-supplied path.
    assert.ok(temp.startsWith(join(tmpdir(), 'dk-skills-')));
    await rm(temp, { recursive: true, force: true });
  }
});

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

test('plugin registers and disposes its provider', async () => {
  let provider, dispose, observed;
  const controller = new AbortController();
  apply({
    get: () => undefined, logger: { warn() {} },
    skills: { registerProvider(create) { provider = create({ signal: controller.signal, invalidate() {} }); } },
    effect(create) { dispose = create(); },
    on(event, handler) { assert.equal(event, 'fs/observed'); observed = handler; },
  }, { includeDefaultRoots: false, watch: false });
  assert.equal(provider.name, 'dk-recursive-skills');
  assert.deepEqual(await provider.list({}), []);
  observed({ displayPath: '/unrelated/file' }, undefined, { name: 'write' });
  await dispose();
  controller.abort();
});
