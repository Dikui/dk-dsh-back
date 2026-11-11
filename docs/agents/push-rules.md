# 项目推送规则

- 默认目标：`origin`，`https://github.com/Dikui/dk-dsh-back.git`，`main`。
- 提交信息沿用 Conventional Commits。
- 插件版本文件：本次 `packages/dk-dsh-skills-mcp-manager/package.json` 的 `version`，以及依赖锁中对应 workspace 条目；本次合并已升到 0.2.0，不重复升版，根包不变。
- 统一管理插件的生成客户端和固定版本 vendor 是用户确认保留的交付文件；安装归档仍按 .gitignore 排除。
- 用户已确认保留上游 CRLF、示例路径和本次新增依赖锁；这些告警不代表真实本机数据。

## 限定豁免

仅豁免本次核实的代码表达式和假凭据示例，不豁免真实凭据。

```safe-push-allow
packages/dk-dsh-skills-mcp-manager/client.js token:t[.]detail[.]token
packages/dk-dsh-skills-mcp-manager/vendor/skills/lib/client.js token:t[.]detail[.]token
packages/dk-dsh-skills-mcp-manager/vendor/skills/lib/repository-updates.js token: plan[.]token
packages/dk-dsh-skills-mcp-manager/vendor/mcp/lib/ops.js ^  const secret = has[L]iteralSecret[(]server[)];
packages/dk-dsh-skills-mcp-manager/vendor/mcp/lib/canonical.js ^ [*]   --figma-api-key=fi[g]d_xxx[[:space:]]+[(]inline value[)]
```
