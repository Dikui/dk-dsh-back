import * as skills from './vendor/skills/lib/index.js';
import * as mcp from './vendor/mcp/lib/index.js';

export const name = 'dk-dsh-skills-mcp-manager';

export function apply(ctx, config = {}) {
  // Keep each provider's own injection and disposal scope.
  ctx.plugin(skills, config.skills ?? {});
  ctx.plugin(mcp, config.mcp ?? {});
}
