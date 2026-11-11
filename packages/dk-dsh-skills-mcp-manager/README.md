# dk-dsh-skills-mcp-manager

一个安装包、一个 **Skills & MCP** 设置入口，分页复用 Skills Manager 1.4.1 和 MCP Manager 0.1.6 的完整业务页面与后端。固定版本实现随包分发，并内置原 `dk-recursive-skills` 的递归发现能力，不再需要独立发现插件。

## 安装与切换

1. 在 DSH 插件管理中停用旧的 `dk-recursive-skills`、`@michengai/dsh-skills-manager` 和 `@oh-agent/dsh-mcp-manager`（保留其数据和技能文件）。不要同时启用，避免重复扫描、注册 API、工具和技能提供器。
2. 上传本项目生成的 `dk-dsh-skills-mcp-manager-0.2.0.tgz` 并升级/启用同名插件。仅保留这一个插件启用。
3. 刷新 GUI，在设置中打开 **Skills & MCP**。原 Skills 侧栏入口及入口位置选项统一收敛为此设置入口。
4. 回滚：停用新版本，恢复旧 Manager 安装包并重新启用独立 `dk-recursive-skills`；旧版各插件用户也可恢复原来的插件组合。

数据目录、API 路径、工具名及写入保护沿用原插件；无需搬迁技能、MCP 配置、分类或备份。现有 Manager 参数分别放入 `config.skills` 和 `config.mcp`；旧 `dk-recursive-skills` 的文件系统参数迁到 `config.skills.filesystem`，默认无需配置。此迁移不会自动修改当前运行中的配置。

```yaml
config:
  skills:
    gitTimeoutMs: 120000
    filesystem:
      watch: true
  mcp:
    includeProjectScope: true
    probeTimeoutMs: 20000
    backupsToKeep: 20
```

## 嵌套技能发现

从 0.2.0 起，递归发现是本插件的内置模块：DSH 运行时 provider 与管理页共用 `readonly-discovery.js`，不再维护两套目录遍历逻辑。运行时复用官方 YAML 解析、正文加载、文件访问检查和目录 watcher；管理页仍保留禁用、无效及被覆盖技能的完整列表，不能用运行时的可调用列表替代。

- 支持每层分类目录中的单文件 `.md` 和包含 `SKILL.md` 的技能包；遇到技能包即停止进入其资源目录。隐藏分类目录和 `node_modules` 不扫描；目录链接可只读发现，按祖先 realpath 防止循环。
- 共用上限为 6 层、2000 个目录、20000 个目录项。达到上限时管理页显示警告，运行时返回不完整观察；不会把截断结果当成完整目录缓存。
- 嵌套技能支持搜索、详情、启停、分类和备注；管理键使用相对路径，调用仍使用 frontmatter 的 `name`。嵌套文件、根目录技能包及不符合直接写入规则的名字只读，不提供移入回收站。分类目录不会被同名技能覆盖或删除。
- 默认用户及项目目录无需搬迁。其他 Agent 来源仍由 Manager 的来源设置管理；原递归插件自定义文件系统根参数可迁入 `skills.filesystem`。

内置 provider 名称为 `dsh-skills-manager-recursive`。保留官方来源优先级并加 0.5，让已有官方同来源条目优先；Manager 的启停策略 provider 继续负责覆盖调用权限。每个已扫描目录复用一个官方 watcher；大目录有额外监听成本，不要把根设置成整个主目录或代码仓库。

## 开发验证

```sh
npm install
npm run build --workspace dk-dsh-skills-mcp-manager
npm test
npm pack --workspace dk-dsh-skills-mcp-manager
```

目标宿主：DSH 0.2.2-rc.1，peer 版本精确锁定。递归模块依赖官方导出的 `FileSystemSkillProvider.roots` 和 `watchManager` 实现钩子；升级宿主必须重新验证。`vendor/` 基于安装版本并保留许可证；Skills 后端包含本项目的嵌套发现与分类目录保护修复；`build.js` 适配客户端入口、移除上游反馈按钮并使用宿主主按钮配色，`client-main.js` 提供统一导航。升级上游版本时必须重新验证构建锚点及 GUI。

自动检查覆盖后端组合/配置、客户端单入口注册、分页切换、上下文透传和卸载清理；不替代真实宿主中的端到端操作验收。此包未自动替换当前运行中的插件。

`npm install --package-lock-only` 仍报告既有 DSH peer 依赖链的高危告警；本次只沿用宿主依赖，不执行可能破坏兼容性的 `npm audit fix --force`。
