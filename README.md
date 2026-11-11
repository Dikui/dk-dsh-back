# dk-dsh-back

DSH 后端扩展项目，使用 npm workspaces；不需要构建步骤。

## 插件

- [dk-recursive-skills](packages/dk-recursive-skills/README.md)：递归发现多层分类目录中的技能，复用官方解析、资源路径和文件监听。

```sh
npm install
npm test
npm pack --workspace dk-recursive-skills
```

插件尚未自动安装到当前 DSH 配置。兼容性和安装步骤见插件说明。
