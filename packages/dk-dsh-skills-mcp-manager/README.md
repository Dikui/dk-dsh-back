# dk-dsh-skills-mcp-manager

一个安装包、一个 **Skills & MCP** 设置入口，分页复用 Skills Manager 1.4.1 和 MCP Manager 0.1.6 的完整业务页面与后端。固定版本实现随包分发，不依赖两个旧插件继续安装。

## 安装与切换

1. 在 DSH 插件管理中停用旧的 `@michengai/dsh-skills-manager` 和 `@oh-agent/dsh-mcp-manager`（保留其数据）。不要同时启用，避免重复注册 API、工具和技能提供器。
2. 上传本项目生成的 `dk-dsh-skills-mcp-manager-0.1.2.tgz` 并启用。
3. 刷新 GUI，在设置中打开 **Skills & MCP**。原 Skills 侧栏入口及入口位置选项统一收敛为此设置入口。
4. 回滚：停用新插件，重新启用两个旧插件。

数据目录、API 路径、工具名及写入保护沿用原插件；无需搬迁技能、MCP 配置、分类或备份。现有自定义插件参数需分别放入新插件的 `config.skills` 和 `config.mcp`，默认值与原插件一致。

```yaml
config:
  skills:
    gitTimeoutMs: 120000
  mcp:
    includeProjectScope: true
    probeTimeoutMs: 20000
    backupsToKeep: 20
```

## 开发验证

```sh
npm install
npm run build --workspace dk-dsh-skills-mcp-manager
npm test
npm pack --workspace dk-dsh-skills-mcp-manager
```

目标宿主：DSH 0.2.2-rc.1。`vendor/` 保留安装版本原始文件和许可证；`build.js` 适配客户端入口、移除上游反馈按钮并使用宿主主按钮配色，`client-main.js` 提供统一导航。升级上游版本时必须重新验证构建锚点及 GUI。

自动检查覆盖后端组合/配置、客户端单入口注册、分页切换、上下文透传和卸载清理；不替代真实宿主中的端到端操作验收。此包未自动替换当前运行中的插件。

工作区 `npm audit` 报告既有 `dk-recursive-skills` 的 DSH peer 依赖链中 zod 的高危告警；本插件仅新增原 Skills Manager 使用的 fflate 0.8.3，不强制升级宿主依赖。
