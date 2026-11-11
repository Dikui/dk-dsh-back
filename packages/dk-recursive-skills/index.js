import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Config as FilesystemConfig, FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';

export const name = 'dk-recursive-skills';
export const inject = ['skills'];
export const Config = FilesystemConfig;

// Reuse upstream parsing, invocation policy, resource paths and per-directory watchers.
// ponytail: relies on the exported provider's roots hook; pin DSH until revalidated on upgrade.
export class RecursiveSkillProvider extends FileSystemSkillProvider {
  async roots(cwd) {
    const roots = await super.roots(cwd);
    const expanded = [];
    const fs = this.ctx.get('fs');
    for (const root of roots) {
      const seen = new Set();
      const pending = [root.path];
      while (pending.length) {
        const directory = pending.pop();
        let entries;
        try {
          // Preserve the host's filesystem access checks before inspecting directory identity.
          if (fs && !root.trustedHost) {
            entries = await fs.listDir(await fs.resolve(directory));
          } else {
            entries = await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => ({
              name: entry.name,
              type: (entry.isSymbolicLink() ? await stat(join(directory, entry.name)) : entry).isDirectory() ? 'directory' : 'file',
            })));
          }
          const identity = await realpath(directory);
          if (seen.has(identity)) continue;
          seen.add(identity);
        } catch (error) {
          if (['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error.code)) {
            expanded.push({ ...root, path: directory }); // Watch roots created after startup too.
            continue;
          }
          throw error;
        }
        expanded.push({ ...root, path: directory });
        const children = entries.filter(entry => entry.type === 'directory'
          && !entry.name.startsWith('.') && entry.name !== 'node_modules')
          .sort((a, b) => b.name.localeCompare(a.name));
        for (const child of children) {
          const path = join(directory, child.name);
          // A skill bundle owns its resources: never interpret its references/*.md as skills.
          let skill;
          try {
            skill = fs && !root.trustedHost
              ? await fs.stat(await fs.resolve(join(path, 'SKILL.md')))
              : await stat(join(path, 'SKILL.md'));
          } catch (error) {
            if (!['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error.code)) throw error;
          }
          if (!(skill && (typeof skill.isFile === 'function' ? skill.isFile() : skill.type === 'file'))) pending.push(path);
        }
      }
    }
    return expanded;
  }

  async list(options) {
    const result = await super.list(options);
    const candidates = Array.isArray(result) ? result : result.candidates;
    // Let the built-in provider win equal-source duplicates, independent of plugin mount order.
    for (const candidate of candidates) candidate.rank += 0.5;
    return result;
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
