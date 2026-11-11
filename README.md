# dk-dsh-back

DSH 后端扩展项目，使用 npm workspaces；统一管理插件需要生成客户端 bundle。

## 插件

- [dk-dsh-skills-mcp-manager](packages/dk-dsh-skills-mcp-manager/README.md)：单一入口统一管理 Skills 与 MCP，保留原有业务和数据。

- [dk-recursive-skills](packages/dk-recursive-skills/README.md)：递归发现多层分类目录中的技能，复用官方解析、资源路径和文件监听。

```sh
npm install
npm test
npm pack --workspace dk-recursive-skills
```

插件尚未自动安装到当前 DSH 配置。兼容性和安装步骤见插件说明。
