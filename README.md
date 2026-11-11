# dk-dsh-back

DSH 后端扩展项目，使用 npm workspaces；统一管理插件需要生成客户端 bundle。

## 插件

- [dk-dsh-skills-mcp-manager](packages/dk-dsh-skills-mcp-manager/README.md)：单一入口统一管理 Skills 与 MCP，内置递归技能发现；管理页与运行时复用同一发现规则。

原 `dk-recursive-skills` 已合并，不再独立打包；升级时停用旧插件即可，技能文件无需搬迁。

```sh
npm install
npm test
npm pack --workspace dk-dsh-skills-mcp-manager
```

插件尚未自动安装到当前 DSH 配置。兼容性和安装步骤见插件说明。
