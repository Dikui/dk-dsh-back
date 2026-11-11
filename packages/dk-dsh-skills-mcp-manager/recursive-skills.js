import { dirname } from 'node:path';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { discoverReadonlyEntries } from './vendor/skills/lib/readonly-discovery.js';

export const name = 'dsh-skills-manager-recursive';
export const inject = ['skills'];

// ponytail: pinned upstream roots/watchManager hooks; revalidate when upgrading DSH.
// ponytail: one upstream watcher per scanned directory; shared recursive watcher if scale demands it.
export class RecursiveSkillProvider extends FileSystemSkillProvider {
  async list(options) {
    options.signal?.throwIfAborted();
    const candidates = [];
    const watched = [];
    const scans = [];
    let complete = true;
    for (const root of await super.roots(options.cwd)) {
      options.signal?.throwIfAborted();
      const scan = await discoverReadonlyEntries(root.path, {
        fileSystem: root.trustedHost ? undefined : this.ctx.get('fs'),
        signal: options.signal,
      });
      complete &&= scan.complete;
      watched.push(...scan.directories.map(path => ({ ...root, path })));
      scans.push({ root, scan });
    }
    try { await this.watchManager.observeRoots(watched); }
    catch (error) { options.signal?.throwIfAborted(); complete = false; }
    for (const { root, scan } of scans) {
      for (const entry of scan.entries) {
        options.signal?.throwIfAborted();
        const locator = { path: entry.docPath, directory: entry.kind === 'bundle' ? entry.entryPath : dirname(entry.docPath) };
        const candidate = { provider: this.name, source: root.source, rank: root.rank + 0.5, locator };
        try {
          const skill = await super.get(candidate, options);
          if (skill) {
            const { content, ...summary } = skill;
            candidates.push({ ...candidate, ...summary });
          }
        } catch (error) {
          options.signal?.throwIfAborted();
          complete = false;
          this.ctx.logger.warn('skill file ' + entry.docPath + ' skipped: ' + error.message);
        }
      }
    }
    return complete ? candidates : { candidates, complete: false };
  }
}

export function apply(ctx, config = {}) {
  let provider;
  ctx.skills.registerProvider(control => {
    provider = new RecursiveSkillProvider(ctx, control, { ...config, providerName: name });
    return provider;
  });
  ctx.effect(() => () => provider.dispose());
  ctx.on('fs/observed', (target, _observation, actor) => {
    if (actor?.name === 'write' || actor?.name === 'edit') provider.observeHostMutation(target.displayPath);
  });
}
