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
4. 中文只用于界面与说明。**上游技能不做手工改写**：任何改写都必须落进
   `vendor/upstreams.json` 的 `rewrite` / `extraDirs` / `scriptClosure` / `aliases` 或
   `vendor/skill-patches.json`，由 `scripts/vendor-skills.mjs` 每次重建时重放；
   直接手改 `skills/` 下的上游文件会在下次 vendor 时被覆盖，且不可审计。
5. 过程文件（下载缓存、日志、报告）放 `..\AgentsDo\skill-management-20261027\`，
   交付文档放 `docs\`。

## 改代码之后的检查顺序

```powershell
node --check host\*.mjs            # 语法
node scripts/build-client.mjs      # 改了 client/ 必须重新构建
node scripts/verify.mjs            # 包/目录/中文/默认集合/语法全检
node scripts/smoke-host.mjs        # 宿主冒烟（不装 DSH）
```

改了宿主半侧后，装进 profile 用 `plugin_manager install_bundle`（或 `dsh plugin add`）；
客户端改动需要刷新页面才会加载新 bundle。

本地用 `dsh web` 起独立实例验证，不动 Desktop 常驻实例：

```powershell
dsh --profile web --port 60335 --no-open
# 启动日志里的 .../?token=... 打开即是已登录的 Web UI
```

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `host/index.mjs` | 装配：provide 服务、注入 webServer、注册路由 |
| `host/config.mjs` | 路径与常量（`ZRWANG_PLUGIN_STATE_DIR` 可改测试状态目录） |
| `host/ars.mjs` | ARS 运行环境：读 `catalog/ars.json`、探测 Python、生成 `_shared/dsh-runtime.md`、检查依赖、把 5 个技能并进注入集合 |
| `host/ars-commands.mjs` | ARS 的 16 个 `/ars-*` 原生命令：命令处理器用 `agent.followup()` 投递"技能指令 + 用户输入" |
| `host/project.mjs` | cwd → 项目根（最近 `.git` 祖先，否则 cwd） |
| `host/catalog.mjs` | 读 catalog.json、遍历/查询目录树 |
| `host/sessions.mjs` | 会话一级开关 |
| `host/selection.mjs` | 全局技能勾选、门禁后的目标集合 |
| `host/farm.mjs` | 目录联接的创建/移除/冲突检测、ppt projects 链接 |
| `host/skill-config.mjs` | `.env`/TOML/YAML 配置表单读写（写前备份） |
| `host/presets.mjs` | 技能选择态：按项目 + 对话保存注入模式（默认只读、改动派生未命名、未命名改名后升级为项目级） |
| `host/skill-guard.mjs` | 技能文件护栏：模型 `write`/`edit` 插件内 `skills/`、`ars/` 一律拒绝（含经项目联接写入） |
| `host/routes.mjs` | `/dsh-zrwang-plugin/*` 接口与同源栅栏 |
| `client/*.mjs` → `lib/client.js` | 页签界面；片段共享一个工厂作用域，只 `require('react')` |
| `scripts/vendor-skills.mjs` | 从上游下载技能、按规则补目录/改写/换描述/生成别名、写 lock |
| `scripts/gen-catalog.mjs` | 合成中文目录树 catalog.json |
| `scripts/gen-skill-details.mjs` | 用 Google 翻译重生成 `catalog/skill-details.zh.json`：取每个技能 SKILL.md 的 description 翻成简体中文，逐条缓存到 `AgentsDo/gt-cache/`，支持 `--repair` 只补坏条目 |
| `scripts/verify.mjs` / `smoke-host.mjs` | 自检 |
| `vendor/ars/descriptions.json` | ARS 五个技能的 DSH 目录描述（≤480 字，原文留档在 `_shared/`）与 16 条命令中文说明 |
| `catalog/ars.json` | ARS 功能区块清单（技能目录、命令清单、用法文档），由 vendor 生成，宿主导入用 |

## 容易踩的坑

- Git for Windows 的 GNU tar 会把 `D:\...` 的冒号当远程主机、还会转义反斜杠；
  解压用 `cwd` + 正斜杠相对路径。
- `dsh-skill-filesystem` 只扫 `<项目根>/.agents/skills/<名字>/SKILL.md` 一层；
  技能目录里再有子技能不会被发现。
- 技能的**资源根就是发现时的路径**（含目录联接），模型按资源根解析正文里的相对路径；
  所以上游放在仓库根、被技能按 `shared/…` 引用的内容必须打进技能目录
  （ARS 就是 `_shared/`），不能指望 `../`。
- DSH 技能目录对描述只显示前 500 字；上游描述过长时触发词会被截断，
  用 `vendor/ars/descriptions.json` 这类覆盖表换成双语摘要。
- `disable-model-invocation: true` 只把技能从模型目录隐藏，用户仍可 `/技能名` 调用；
  ARS 的 16 个命令正文就是这么存的（但对外用原生命令，不把别名注入项目）。
- DSH 的 `ctx.commands.register` 默认**不产生模型消息**；要让命令变成"提示词"，
  处理器里用 `invocation.agent.followup({ id, role:'user', content, source })` 投递用户消息。
- ARS 是技能列表的第四行：共用门禁 `gates.ars`（默认 `false`），不进技能树、不列子技能；
  选中时 `mergeArsSkills(desired, true)` 并进 5 个技能，关掉即摘除。
- **ARS 多角色门禁**：`/ars-full`、`/ars-reviewer`、`/ars-lit-review` 等会拉起多个角色的命令，在执行前检查当前会话有没有 `spawn_teammate` 工具；没有就报错让用户先开 Agent Team。`/ars-plan`、`/ars-cache-invalidate`、`/ars-mark-read` 属于单角色/单机制，不受限制。
- **技能文件护栏**：模型用 `write`/`edit` 改插件内 `skills/` 或 `ars/` 会被 `host/skill-guard.mjs`
  拒绝（项目 `.agents/skills/` 联接路径会 realpath 回插件目录，同样命中）。开发时改技能只走
  `vendor/` 规则 + `node scripts/vendor-skills.mjs`；shell 不在护栏范围内，所以 vendor 脚本能跑。
- `--only` 支持逗号多选（`--only=qinyan,nsfc,supervisor`），局部 vendor 只重建这些仓库并合并回 `skills/`。
- 上游技能与已有技能重名时，用条目的 `renames` 改**落盘目录名**，再用 `vendor/skill-patches.json` 同步
  frontmatter 的 `name`（示例：Supervisor 的 `deep-research` → `supervisor-deep-research`）。
- 新增仓库后，先 `vendor --only=…`，再 `gen-skill-details.mjs --scan-extras` 补中文短说明，
  最后 `gen-catalog.mjs`；直接 gen-catalog 会因缺中文名而失败。
- qinyan 这类“分类目录 + 技能目录”的上游用 `catalog` layout；`nodes.zh.json` 里的分类子节点 id
  必须与上游目录名完全一致（含 `01-` 这类前缀）。
- `nsfc-agent-skills` 上游无 LICENSE、`guizang-ppt-skill` 是 AGPL-3.0、Supervisor 是 CC BY-NC-SA、
  lieflat 两仓库是 PolyForm Noncommercial：这些技能只能随包本地使用，公开发布前需逐个确认许可。
- **技能选择态 v2（按项目 + 对话）**：`state/presets.json` 存 `modes`（默认 + 项目级命名）、
  `unnamed[sessionId]`（每个对话一个未命名）、`active[sessionId]`。所有写接口先 `activateMode` 同步当前对话
  的模式，再 `ensureEditableMode`（在「默认」上改东西会派生未命名），改完 `saveActiveMode`；
  漏掉这三步会导致 A 对话的模式串到 B 对话的显示。
- 新增技能密钥放 `settings.json` 的 `newSkills`，保存和启动时都调用 `applySkillEnv` 写进 `process.env`，模型跑 shell 时子进程继承；密钥字段留空表示保留已保存值，想清空要直接改 settings.json。
- 专利技能按 9 个子技能独立收录（`skills` layout → `research/patent/<技能>`）；上游正文里的“整仓路径”
  `skills/<子技能>/` 由 rewrite 改成 `../<子技能>/`，保证单独注入后相对路径仍成立。
- 上游完整性用 `node scripts/audit-upstreams.mjs --proxy=…` 核对；GH 按钮只给“项目根”生成（见 3.7）。
- 层级行「全选/全关」走 `POST /children` → `selection.mjs` 的 `childBatch`：只处理直接子节点
  （子是技能改 selection，子是目录改该目录门禁），不要写成递归。
- Junction 在 Node 里用 `fs.symlink(target, link, 'junction')` 建、`fs.rmdir` 摘；
  `unlink` 对 junction 无效。
- 项目里有同名真实目录时，`reconcile` 只报冲突，不要覆盖。
- 默认集合来自 `catalog/legacy/legacy-enabled.json`，改默认值要同时改 `gen-catalog.mjs` 的过滤规则。
- 局部 vendor（`--only=`）时，DSH 的文件监视器可能持有技能目录句柄，整体 rename 会 EPERM；
  脚本已退化为覆盖合并，日志里会打印提示。
