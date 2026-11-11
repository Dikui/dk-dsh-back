const React = require('react');
const h = React.createElement;
const id = 'dk-dsh-skills-mcp-manager';
return {
  inject: ['slots', 'locale'],
  apply(ctx) {
    skills.apply(ctx);
    mcp.apply(ctx);
    function Manager(props) {
      const [active, setActive] = React.useState('skills');
      return h('section', null,
        h('h2', null, 'Skills & MCP'),
        h('div', { role: 'group', 'aria-label': 'Skills / MCP', style: { display: 'flex', gap: 8, marginBottom: 16 } },
          ...['skills', 'mcp'].map(key => h('button', {
            key, type: 'button', 'aria-pressed': active === key,
            onClick: () => setActive(key),
            style: { padding: '6px 16px', cursor: 'pointer', fontWeight: active === key ? 700 : 400 },
          }, key === 'skills' ? 'Skills' : 'MCP'))),
        h('div', { hidden: active !== 'skills' }, h(skills.Page, props)),
        h('div', { hidden: active !== 'mcp' }, h(mcp.Page, { ...props, __ctx: ctx })));
    }
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id, order: 25, label: () => 'Skills & MCP', icon: 'skill',
    }, Manager));
  },
};
