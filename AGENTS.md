# 本仓库约定（给在此工作的 AI / 人）

这是 DSH 右侧栏插件 `dsh-zrwang-plugin`，服务于**本机**（Windows + DSH Desktop）。

## 硬约束

1. **只写本目录**，加上运行期目标：
   - `<项目根>/.agents/skills/`：只建/摘指向本包 `skills/` 的目录联接；
   - `<项目根>/.agents/ppt-master/projects/`：ppt-master 输出目录，只在勾选 ppt-master 时创建；
   - `<项目根>/.agents/...` 之外不写。
2. **删除一律进回收站**；本插件代码不调用 `rm`/`rmdir` 删除用户内容，只摘链接。
   过程目录（`AgentsDo/skill-management-*/`）里的临时文件由脚本自行管理。
3. `.env`、`skills/**/.env`、`state/`、`**/projects/` 一律不入库。
4. 中文只用于界面与说明；**不要改 vendored SKILL.md**，技能更新按上游原样重新下载。
5. 过程文件（下载缓存、日志、报告）放 `..\AgentsDo\skill-management-20261027\`，
   交付文档放 `docs\`。

## 改代码之后的检查顺序

```powershell
node --check host\*.mjs            # 语法
node scripts/build-client.mjs      # 改了 client/ 必须重新构建
node scripts/verify.mjs            # 包/目录/中文/默认集合/语法全检
node scripts/smoke-host.mjs        # 宿主冒烟（不装 DSH）
```

改了宿主半侧后，装进 desktop profile 用 `plugin_manager install_bundle`；
客户端改动需要刷新页面才会加载新 bundle。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `host/index.mjs` | 装配：provide 服务、注入 webServer、注册路由 |
| `host/config.mjs` | 路径与常量（`ZRWANG_PLUGIN_STATE_DIR` 可改测试状态目录） |
| `host/project.mjs` | cwd → 项目根（最近 `.git` 祖先，否则 cwd） |
| `host/catalog.mjs` | 读 catalog.json、遍历/查询目录树 |
| `host/sessions.mjs` | 会话一级开关 |
| `host/selection.mjs` | 全局技能勾选、门禁后的目标集合 |
| `host/farm.mjs` | 目录联接的创建/移除/冲突检测、ppt projects 链接 |
| `host/skill-config.mjs` | `.env`/TOML/YAML 配置表单读写（写前备份） |
| `host/routes.mjs` | `/dsh-zrwang-plugin/*` 接口与同源栅栏 |
| `client/*.mjs` → `lib/client.js` | 页签界面；片段共享一个工厂作用域，只 `require('react')` |
| `scripts/vendor-skills.mjs` | 从上游下载技能、保留用户配置、写 lock |
| `scripts/gen-catalog.mjs` | 合成中文目录树 catalog.json |
| `scripts/verify.mjs` / `smoke-host.mjs` | 自检 |

## 容易踩的坑

- Git for Windows 的 GNU tar 会把 `D:\...` 的冒号当远程主机、还会转义反斜杠；
  解压用 `cwd` + 正斜杠相对路径。
- `dsh-skill-filesystem` 只扫 `<项目根>/.agents/skills/<名字>/SKILL.md` 一层；
  技能目录里再有子技能不会被发现。
- Junction 在 Node 里用 `fs.symlink(target, link, 'junction')` 建、`fs.rmdir` 摘；
  `unlink` 对 junction 无效。
- 项目里有同名真实目录时，`reconcile` 只报冲突，不要覆盖。
- 默认集合来自 `catalog/legacy/legacy-enabled.json`，改默认值要同时改 `gen-catalog.mjs` 的过滤规则。
