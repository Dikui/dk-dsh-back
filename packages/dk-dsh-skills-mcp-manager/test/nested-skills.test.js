import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteSkill, getProviderSkill, importSkill, listProviderCandidates, projectRoots,
  reloadRootPathOverrides, resolveEntry, scanEntries, setSkillEnabled,
  skillDetail, state, userRoots,
} from '../vendor/skills/lib/core.js';

test('native user and project skills include nested bundles with safe policy controls', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-nested-skills-')));
  const env = { ...process.env };
  Object.assign(process.env, { HOME: home, DSH_HOME: join(home, '.dsh'), DSH_AGENTS_HOME: join(home, '.agents') });
  reloadRootPathOverrides();
  try {
    const user = userRoots().find(root => root.key === 'dsh');
    const workspace = join(home, 'project');
    await mkdir(join(workspace, '.git'), { recursive: true });
    const project = (await projectRoots([workspace])).find(root => root.kind === 'project-dsh');
    for (const root of [user, project]) {
      const name = 'development/testing/demo';
      const bundle = join(root.path, name);
      const declaredName = root === user ? 'demo-user' : 'demo-project';
      const document = `---\nname: ${declaredName}\ndescription: Nested skill\n---\nNested body\n`;
      await mkdir(join(bundle, 'references'), { recursive: true });
      await writeFile(join(bundle, 'SKILL.md'), document);
      await writeFile(join(bundle, 'references', 'not-a-skill.md'), document);
      await writeFile(join(root.path, 'flat.md'), document.replace(declaredName, `${declaredName}-flat`));
      await writeFile(join(root.path, 'development/flat.md'), document.replace(declaredName, `${declaredName}-nested-flat`));
      const scan = await scanEntries(root);
      assert.deepEqual(scan.entries.map(entry => entry.name), ['development/flat', name, 'flat']);
      assert.equal((await resolveEntry(root, name)).docPath, join(bundle, 'SKILL.md'));
      assert.equal(await resolveEntry(root, '../outside'), null);
      assert.equal(await resolveEntry(root, 'development/../../outside'), null);
      const detail = await skillDetail(root.key, name, { projectCwds: [workspace] });
      assert.equal(detail.declaredName, declaredName);
      assert.equal(detail.body, 'Nested body');
      assert.equal(detail.sourceReadOnly, true);
      const snapshot = await state({ projectCwds: [workspace] });
      assert.ok(snapshot.roots.find(item => item.key === root.key).skills.some(item => item.name === name));
      assert.equal((await setSkillEnabled(root, name, false)).enabled, false);
      const candidate = (await listProviderCandidates({ cwd: root === project ? workspace : undefined }))
        .find(item => item.name === declaredName && item.locator.rootKey === root.key);
      assert.equal(candidate.invocation.modelInvocable, false);
      assert.equal(candidate.resourceBase.path, bundle);
      assert.ok(await getProviderSkill(candidate, { cwd: workspace }));
      assert.equal((await setSkillEnabled(root, 'development/flat', false)).enabled, false);
      const flatCandidate = (await listProviderCandidates({ cwd: root === project ? workspace : undefined }))
        .find(item => item.name === `${declaredName}-nested-flat`);
      assert.equal(flatCandidate.resourceBase.path, join(root.path, 'development'));
      assert.equal((await setSkillEnabled(root, 'development/flat', true)).enabled, true);
      assert.equal((await setSkillEnabled(root, name, true)).enabled, true);
      assert.equal((await deleteSkill(root, name)).ok, false);
      assert.equal(await readFile(join(bundle, 'SKILL.md'), 'utf8'), document);
    }
    const incoming = join(home, 'incoming', 'development');
    await mkdir(incoming, { recursive: true });
    await writeFile(join(incoming, 'SKILL.md'), '---\nname: development\ndescription: Replacement\n---\nBody\n');
    assert.equal((await importSkill(incoming, undefined, { root: user, conflict: 'overwrite' })).ok, false);
    await writeFile(join(user.path, 'development.md'), '---\nname: flat-sibling\ndescription: Flat\n---\nBody\n');
    assert.equal((await deleteSkill(user, 'development')).code, 'error.skill.namespace');
    assert.ok(await readFile(join(user.path, 'development/testing/demo/SKILL.md'), 'utf8'));
    await symlink(user.path, join(user.path, 'loop'));
    assert.equal((await scanEntries(user)).entries.length, 4);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    reloadRootPathOverrides();
    await rm(home, { recursive: true, force: true });
  }
});
