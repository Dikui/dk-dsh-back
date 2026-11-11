# dk-recursive-skills

为 DSH 增加递归本地技能发现，不替换内置文件系统 provider，不修改应用安装包。

```text
skills/
  flat.md
  development/
    testing/
      foo/
        SKILL.md
        references/example.md
```

以上发现 `flat` 和 `foo`。名称来自 YAML frontmatter 的 `name`，仍然使用 `foo` 调用，不使用目录路径；正文、description、调用策略和资源相对路径沿用官方解析。

## 范围和行为

- 沿用官方项目 `.dsh/skills`、`.agents/skills`、用户技能目录、bundledSkillDir 和 customSkillDirs。
- 递归分类目录；遇到包含 `SKILL.md` 的技能包即停止向包内递归，避免把参考文档当技能。
- 不递归隐藏分类目录和 `node_modules`；直属技能的识别仍遵循官方规则。
- 跟随目录符号链接，以 realpath 去重防止循环；启用 DSH 文件系统服务时先经过其目录访问检查。
- 保留官方来源优先级，rank 加 0.5，使相同来源内置 provider 优先；插件内部按根目录配置顺序和确定的目录遍历顺序处理同名。建议所有技能名称唯一。
- 复用官方目录 watcher，支持新增分类、技能修改、删除以及启动后才创建的根目录。`watch: false` 会关闭自动刷新。

## 安装与配置

已验证的 DSH 版本：`0.2.2-rc.1`。插件复用导出的 `FileSystemSkillProvider.roots()` 实现钩子；版本升级需要重新验证，因此兼容范围锁定此版本。

从仓库根目录打包：

```sh
npm pack --workspace dk-recursive-skills
```

在 DSH 插件管理中安装生成的本地 tgz 包。包内 `cordis.patch.yml` 会新增 `dk-recursive-skills` 插件条目。当前项目创建过程不会自动安装或启用它。

默认无需配置。插件条目可传递官方 filesystem provider 的配置，例如：

```yaml
- id: dk-recursive-skills
  name: dk-recursive-skills
  config:
    includeDefaultRoots: true
    customSkillDirs:
      - /absolute/path/to/extra-skills
```

`providerName` 固定为 `dk-recursive-skills`，避免和内置 provider 冲突。

## 开发

在可获取对应 DSH peer 包的环境中运行：

```sh
npm install
npm test
```

测试使用真实官方 provider，覆盖递归、正文加载、资源目录、调用策略、优先级、符号链接循环、动态增删改、缺失根目录和插件销毁。

目录规模很大时，每个分类目录一个官方 watcher 会增加开销；目前没有额外实现独立递归 watcher。技能目录应仅放技能，不应指向整个仓库或用户主目录。
