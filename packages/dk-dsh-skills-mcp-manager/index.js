import * as skills from './vendor/skills/lib/index.js';
import * as mcp from './vendor/mcp/lib/index.js';
import * as recursive from './recursive-skills.js';

export const name = 'dk-dsh-skills-mcp-manager';

export function apply(ctx, config = {}) {
  // Keep each provider's own injection and disposal scope.
  ctx.plugin(recursive, config.skills?.filesystem ?? {});
  ctx.plugin(skills, config.skills ?? {});
  ctx.plugin(mcp, config.mcp ?? {});
}
