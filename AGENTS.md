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
   `vendor/upstreams.json` 的 `rewrite` / `renames` / `headerNote(s)` / `extraDirs` / `scriptClosure` / `aliases`
   或 `vendor/skill-patches.json`，由 `scripts/vendor-skills.mjs` 每次重建时重放；
   直接手改 `skills/` 下的上游文件会在下次 vendor 时被覆盖，且不可审计。
   每一条改动都必须同步登记到 `AgentsDo/upstream-adaptation-record/`；升级上游前先读该目录，
   `records.json` 的 SHA 与 `vendor/upstreams.lock.json` 不一致时 `verify` 会直接失败。
5. 过程文件（下载缓存、日志、报告）放 `..\AgentsDo\skill-management-20261027\`，
   交付文档放 `docs\`。

## 改代码之后的检查顺序

```powershell
node --check host\*.mjs            # 语法
node scripts/build-client.mjs      # 改了 client/ 必须重新构建
node scripts/verify.mjs            # 包/目录/中文/默认集合/语法/记录/SHA 全检
node scripts/audit-skill-config.mjs --check  # 301 技能配置矩阵无待处置项
node scripts/verify-skill-config.mjs         # 设置→进程环境→技能检查的回归（需本机有可用系统 Python）
node scripts/smoke-host.mjs        # 宿主冒烟（不装 DSH）
node scripts/smoke-routes.mjs      # 路由层回归（假 webServer + 假 workspaceRegistry）
```

改了宿主半侧后，装进 profile 用 `plugin_manager install_bundle`（或 `dsh plugin add`）；
客户端改动需要刷新页面才会加载新 bundle。

本地验证用 `dsh web`，不动 Desktop 常驻实例。**任何插件安装、以及新建测试 profile 都必须先征得用户同意**：
不得私自创建新的 profile，也不得把插件装进用户已有 profile（web / desktop）；用户同意后建的一次性测试环境用完要删
（只进回收站），不要在机器上留残留。

经用户同意后，测试实例用项目内的临时 DSH 家目录，避免写 C 盘（插件设置与状态也跟着隔离，
`host/plugin-params.mjs` 认 `$DSH_HOME`）：

```powershell
$env:DSH_HOME = 'D:\Projects\dsh-zrwang-plugin\AgentsDo\<经同意的一次性目录>\home'
$env:ZRWANG_PLUGIN_STATE_DIR = 'D:\Projects\dsh-zrwang-plugin\AgentsDo\<经同意的一次性目录>\state'
dsh --profile <测试 profile> --from-default-profile web --port 60335 --no-open
# 启动日志里的 .../?token=... 打开即是已登录的 Web UI
```

测试 profile 的 `cordis.patch.yml` 里把 `workspace-controller` 的 `documentsDirectory` 指到项目内，
避免首次启动在工作区外创建默认工作区目录。浏览器验证用 ego lite（`ego-browser`，本机装在
`C:\Program Files\Citro Labs\ego lite\Application\<版本>\ego-browser.exe`，PATH 里的 junction 可能过期，
建议直接用全路径调用）。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `host/index.mjs` | 装配：provide 服务、注入 webServer、注册路由 |
| `host/config.mjs` | 路径与常量（`ZRWANG_PLUGIN_STATE_DIR` 可改测试状态目录） |
| `host/ars.mjs` | 系统 Python 选择、python/python3/bash shim、ARS 运行时说明与依赖检查 |
| `host/python-detect.mjs` | 检测本机 Python（PATH/py 启动器/Conda/常见目录）并只读校验依赖；不安装任何东西 |
| `host/ars-commands.mjs` | ARS 的 16 个 `/ars-*` 原生命令：命令处理器用 `agent.followup()` 投递"技能指令 + 用户输入" |
| `host/project.mjs` | cwd → 项目根（最近 `.git` 祖先，否则 cwd） |
| `host/catalog.mjs` | 读 catalog.json、遍历/查询目录树 |
| `host/sessions.mjs` | 会话一级开关 |
| `host/selection.mjs` | 全局技能勾选、门禁后的目标集合 |
| `host/farm.mjs` | 目录联接的创建/移除/冲突检测、ppt projects 链接 |
| `host/skill-settings.mjs` | 设置参数、技能运行时文件生成、进程环境注入、组件状态与检查动作（写前备份） |
| `host/presets.mjs` | 技能选择态 v3：按项目 + DSH 工作区保存注入模式（默认只读、改动建立以工作区命名的模式、同工作区共享、自动保存） |
| `host/workspaces.mjs` | 会话 → DSH 工作区（`ctx.workspaceRegistry`）解析与工作区名 → 模式名规则 |
| `host/skill-guard.mjs` | 技能文件护栏：模型 `write`/`edit` 插件内 `skills/`、`ars/` 一律拒绝（含经项目联接写入） |
| `host/mcp.mjs` | 两个 MCP 组件：MathWorks（随工程技能组自动）与 Windows MCP（手动）→ `ctx.mcpManager.register` 动态注册/注销，含设置页检查 |
| `host/routes.mjs` | `/dsh-zrwang-plugin/*` 接口与同源栅栏 |
| `mathworks/` | MCP 组件自带内容：MATLAB MCP exe + 完整的 Simulink Agentic Toolkit 运行时 |
| `client/*.mjs` → `lib/client.js` | 页签界面；片段共享一个工厂作用域，只 `require('react')` |
| `scripts/vendor-skills.mjs` | 从上游下载技能、按规则补目录/改写/换描述/生成别名、写 lock；`--locked` 按 lock SHA 重建，`--proxy=…` 走代理 |
| `scripts/audit-skill-config.mjs` | 逐技能扫描配置冲突，生成 `AgentsDo/upstream-adaptation-record/skill-config-matrix.{md,json}`；`--check` 有未处置项时失败 |
| `vendor/skill-config-rules.json` | 审计规则：profile 忽略项、逐技能处置、组件状态 |
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
- `--only` 支持逗号多选（`--only=nsfc,supervisor`），局部 vendor 只重建这些仓库并合并回 `skills/`。
- 上游技能与已有技能重名时，用条目的 `renames` 改**落盘目录名**，再用 `vendor/skill-patches.json` 同步
  frontmatter 的 `name`（示例：Supervisor 的 `deep-research` → `supervisor-deep-research`）。
- 新增仓库后，先 `vendor --only=…`，再 `gen-skill-details.mjs --scan-extras` 补中文短说明，
  最后 `gen-catalog.mjs`；直接 gen-catalog 会因缺中文名而失败。
- “分类目录 + 技能目录”的上游用 `catalog` layout；`nodes.zh.json` 里的分类子节点 id
  必须与上游目录名完全一致（含 `01-` 这类前缀）。**沁言学术（`qinyan`，187 个技能）已于 2026-11 移除**：
  技能目录进回收站，`vendor/upstreams.json` / lock / `nodes.zh.json` / 设置卡同步删除；
  不要再把它加回 `vendor/upstreams.json`，否则 `gen-catalog` 会因 lock 对不上而失败。
- `nsfc-agent-skills` 上游无 LICENSE、`guizang-ppt-skill` 是 AGPL-3.0、Supervisor 是 CC BY-NC-SA、
  lieflat 两仓库是 PolyForm Noncommercial：这些技能只能随包本地使用，公开发布前需逐个确认许可。
- **技能选择态 v3（按项目 + DSH 工作区）**：`state/presets.json` 存 `modes`（默认 + 项目级命名）、
  `auto[workspaceKey]`（每个工作区一个、名字取工作区标题）、`active[workspaceKey]`。所有写接口先
  `activateMode` 同步当前工作区的模式，再 `ensureEditableMode`（在「默认」上改东西会建立/复用工作区模式），
  改完 `saveActiveMode`；漏掉这三步会让 A 工作区的模式串到 B 工作区的显示。
  `active` 按工作区不按对话——同工作区所有对话必须看到同一模式；自动模式重命名后才是项目级模式。
  所有模式（含「默认」）右键都有「基于此新建」：默认/项目级模式复制进工作区自动模式，工作区自动模式
  复制成项目级副本「源名 (2)」。`ctx.workspaceRegistry` 不保证存在，`host/workspaces.mjs` 在缺失时按项目根回退。
  v2 数据在首次加载时自动迁移（`legacy` 字段，搬完即删）。
- 技能密钥/账号配置走 `settings.json` 的对应字段，保存和启动时都调用 `applySkillEnv` 写进 `process.env`；每个插件实例还会监视 `settings.json` 做跨进程热加载（Web/Desktop 独立进程互推不了环境变量，已运行的长驻子进程保留旧值，新工具调用继承新值），
  模型跑 shell 时子进程继承；密钥字段留空表示保留已保存值，想清空要直接改 settings.json。
  `zotero-cli` 只支持 Zotero 桌面版本地 API，不要给它加官方 Web API 凭据或设置项。
- **`skills/` 内的技能必须按本插件特性适配，不能直接照搬上游原代码/内容**：配置走插件设置或随包固定文件、工具名换成 DSH 能力、相对路径按单独注入成立、多角色写明 Agent Team；所有改写只走 `vendor/` 规则，并在 `SKILL-ADAPTATIONS.md` 登记改造内容（新增/升级技能时同步更新该文件）。
- 学校访问配置固定为北航，直接随技能放在
  `skills/research/nature-skills/nature-downloader/config/school.json`；插件通过 `LIT_DL_SCHOOL_FILE` 指向它，
  不复制到 `~/.dsh`。设置页不再暴露学校字段；出版社 API Key 写 `~/.dsh/zrwang-plugin-config/nature-downloader/credentials.json`，
  Unpaywall 联系邮箱写同目录 `settings.json`（`LIT_DL_CONFIG_DIR` 指向该目录）。
- 专利技能按 9 个子技能独立收录（`skills` layout → `research/patent/<技能>`）；上游正文里的“整仓路径”
  `skills/<子技能>/` 由 rewrite 改成 `../<子技能>/`，保证单独注入后相对路径仍成立。
- 上游完整性用 `node scripts/audit-upstreams.mjs --proxy=…` 核对；GH 按钮只给“项目根”生成（见 3.7）。
- 层级行「全选/全关」走 `POST /children` → `selection.mjs` 的 `childBatch`：只处理直接子节点
  （子是技能改 selection，子是目录改该目录门禁），不要写成递归。
- 目录复选框显示规则：一级分组（工程/科研/办公）和 ARS 是**显式注入闸门**；更深层目录按「子树里有没有
  勾选技能」自下而上推导（`selection.mjs` 的 `effectiveGateOpen` / `buildEffectiveGates`），子树空就显示
  未勾选并禁点，显式 `false` 仍可覆盖。勾选技能变化后要清掉祖先目录的显式门禁（`gates.mjs` 的 `clearGates`），
  否则「全关」过的目录在重新勾选技能后仍显示关闭。
- Junction 在 Node 里用 `fs.symlink(target, link, 'junction')` 建、`fs.rmdir` 摘；
  `unlink` 对 junction 无效。
- 项目里有同名真实目录时，`reconcile` 只报冲突，不要覆盖。
- 默认集合来自 `catalog/legacy/legacy-enabled.json`，改默认值要同时改 `gen-catalog.mjs` 的过滤规则。
- 局部 vendor（`--only=`）时，DSH 的文件监视器可能持有技能目录句柄，整体 rename 会 EPERM；
  脚本已退化为覆盖合并，日志里会打印提示。
- **全量 vendor 前先备份** `skills/` 与 `vendor/*.json`（放 `AgentsDo/skill-upgrade-<日期>/backup/`），
  失败时能把用户配置（`.env`、`config.toml`、`config.yaml` 等被 vendor 保护的 4 类文件）恢复回去；
  `vendor-skills.mjs` 已对 git/网络抖动自动重试 4 次，仍失败就检查 Clash 代理。
- `archify` 是 release 包分发的本地副本（`vendor/local/archify`，v3.2.0，上游仓库根没有 `SKILL.md`），
  不要从 `vendor/upstreams.json` 删掉它，否则全量 vendor 会丢这个技能；许可补在 `vendor/licenses/archify/`。
- **`ars/` 不属于技能树**：ARS 是包根独立功能区块（`outsideCatalog`），`skills/` 下不应出现 `ars/` 目录。
  全量 vendor 必须把 staging 里的 `ars/` 目标移回包根再合并（`scripts/vendor-skills.mjs` 已修正），
  否则会在 `skills/` 下留一份 25MB 重复副本、而包根 `ars/` 还是旧版本。
- simulink 上游新增类别 `aerospace`、`simulink-block-and-blockset-authoring` 已登记到 `upstreams.json` 的
  `order` 和 `nodes.zh.json`；单技能类别会被 `gen-catalog.mjs` 的 flatten 规则提成直属技能，这是既有行为。
- **生图配置 v2**：`settings.json` 只有 `image.{baseUrl,model,apiKey}`，不再分厂商；保存后写
  `ZRWANG_IMAGE_*` 进程环境，`ppt-master` 的 `image_gen.py` 顶部桥接补丁把它映射成 `OPENAI_*` 并固定
  `IMAGE_BACKEND=openai`。`config.py` 已禁用上游 `.env` 查找；**不写 `~/.ppt-master/.env`，不提供兼容开关**。注意 DSH 的 shell 子进程会按变量名清洗 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 类变量（`@deepseek-ai/dsh-subprocess-local` 的凭据清洗），所以密钥不能只靠环境变量传给技能；插件生成 `state/python/sitecustomize.py`，技能用的 Python 进程启动时会从 `settings.json` 把密钥补回 `os.environ`（`image_gen.py` 另保留文件兜底）。新增密钥字段时，记得同步 `applyPythonSecretBridge` 的映射表。
  `image2ppt` 读插件配置目录下的 `config.yaml`（`IMAGE2PPT_CONFIG_HOME`）。
- **Firecrawl（可选）**：`firecrawl-cli` 由 npm 全局安装（`npm i -g firecrawl-cli`）；插件在 `state/bin` 生成 `firecrawl` shim，由 `scripts/firecrawl-shim.mjs` 从 `settings.json` 的 `optional.firecrawlApiKey` 读取 Key 后调用真实 CLI（DSH shell 会清洗 `FIRECRAWL_API_KEY`，不能直接依赖环境变量）。未安装或未设置 Key 时 shim 不存在/CLI 自行报错，skill 会退回内置抓取。
- **系统 Python（不自带、不安装）**：插件不再自带 `runtime/python`、不再有安装脚本；`host/python-detect.mjs` 检测本机
  Python（PATH、py 启动器、Conda、常见目录），用户在设置 → 运行环境 → Python 解释器 里下拉选择（改动自动保存，无保存按钮）；
  `host/ars.mjs` 的 `applyRuntimeEnv` 把 `python` / `python3` 指向所选解释器，`bash` 指向 Git Bash（`BASH_ENV` 注入
  python 函数）。依赖只 import 校验、缺包只提示；**不要加任何 pip/uv 安装或自动补包逻辑**。
- **配置集中**：`nature-academic-search/config.toml`、`nature-image2ppt/config.yaml`、
  `nature-figure.json`、`nature-downloader/{credentials,settings}.json` 都在
  `~/.dsh/zrwang-plugin-config/` 下；`school.json` 直接随技能放在
  `skills/research/nature-skills/nature-downloader/config/school.json`（北航，`LIT_DL_SCHOOL_FILE`），不复制；技能通过 `ZRWANG_NATURE_ACADEMIC_CONFIG`、`IMAGE2PPT_CONFIG_HOME`、
  `LIT_DL_CONFIG_DIR`、`NATURE_FIGURE_CONFIG` 读取，学术邮箱/Firecrawl 通过
  `NCBI_EMAIL`、`UNPAYWALL_EMAIL`、`CROSSREF_MAILTO`、`FIRECRAWL_API_KEY` 注入；Nature 生图直接复用
  模型服务的 `OPENROUTER_API_KEY` / `OPENROUTER_IMAGE_MODEL` / `SCHEMATIC_IMAGE_API_URL`。不要把这些文件再写回 `skills/` 或 `ars/`。
- **ppt-master 项目目录**：`skills/office/ppt-master/projects` 是 farm 建的目录联接，指向
  `<项目根>/.agents/ppt-master/projects`；`paths.py` 的 `PROJECTS_ROOT` 与 `cli.py` 的
  `default_projects_root()` 已打补丁优先用它。多项目并发时链接会指向最近同步的项目，命令应优先传绝对路径。
- **draw.io 路径检测**：先看 `DRAWIO_PATH` 与常见目录，再读 Windows 卸载注册表的 `DisplayIcon`（支持装在 D 盘等非默认位置）；安装后仍未识别时检查注册表项。
- **Windows ImageMagick 误判**：`C:\Windows\System32\convert.exe` 是 FAT→NTFS 工具，不是 ImageMagick；
  `nature-image2ppt` 的探测已排除 `system32` 路径。不要把 `convert` 当 ImageMagick 用。
- **专利工作目录**：三个配置解析器（oa / patent-map / patent-reader）已改为项目内 `.agents/patent/` 优先；
  无项目时落插件配置目录（`PATENT_OA_HOME`/`PATENT_MAP_HOME` 由 `applySkillEnv` 兜底），不写 `~/Documents`。
- **MATLAB MCP 是 existing 模式**：由插件 MathWorks组件在工程技能组开启时动态注册（serverName `matlab-mcp`），
  需要 MATLAB 正在运行并执行 `shareMATLABSession()`；否则工具报 `failed to attach`。MATLAB/Simulink/playground 的
  `SKILL.md` 顶部已加说明，不要绕开 MCP 改用未配置的其它方式。Polyspace 未安装时 19 个技能置灰，draw.io 未安装时 `drawio-reconstruction` 置灰。
- **`vendor --locked`**：局部重建上游时用 `--locked` 按 `upstreams.lock.json` 的 SHA 检出，避免顺带升级；
  下载走代理用 `--proxy=http://127.0.0.1:7897`。`cloneRepoAt` 已固定 `core.autocrlf=true`/`core.eol=crlf`，
  补丁与 headerNote 会先归一化 LF 再写回，避免整树换行 diff。
- **适配记录**：`AgentsDo/upstream-adaptation-record/` 是升级前必读；`README.md` 写流程、`upstream-modifications.md`
  写台账、`skill-config-matrix.md` 写 301 技能状态、`records.json` 记录最后审计 SHA。`verify` 会校验 SHA 与
  `audit-skill-config --check`；不同步更新记录会失败。
- **MCP 组件**：`host/mcp.mjs` 用 `ctx.mcpManager.register()`（DSH ≥ 0.2.2-rc.2 才有）动态注册 `matlab-mcp` /
  `windows-mcp`，插件卸载时注销；headless/sdk profile 没有这个服务，必须降级而不是报错。serverName 固定，
  profile 里若还有同名静态 MCP 行（旧 `mcp-matlab` / `mcp-windows`）会注册冲突，先删静态行。组件状态是宿主
  全局的，不能按会话隔离；MathWorks 组件的开关由「工程门禁 + 工程注入数」推导，不落 gates 文件。
  rc.2 的稳定性能力接上了 `list()` 状态（含 attempt/toolCount/lastError）→ 组件行「启动中/已启动（N 个工具）/启动失败」
  阶段标识 + 客户端轮询、`restart()` 组件行按钮、`POST /mcp` 的 restart/probe 接口；**注册参数固定、设置页不暴露任何 MCP
  配置项**（用户 2026-11-14 要求：mcp 不需要配置；运行环境页只把 matlab-mcp / windows-mcp 作为状态行展示），改参数就改 `host/mcp.mjs` 的 `resolveMatlabEntry/resolveWindowsEntry`。
  新增能力时保持 `POST /mcp` 与 `/health` 的 `mcp` 字段同步。
- **MathWorks组件自带全部内容**：`mathworks/` 里是 MATLAB MCP exe + 完整的 Simulink Agentic Toolkit 运行时
  （`satk_initialize.p`、`tools/` 函数、`toolbox-kb/` 等），MATLAB 侧 `addpath(mathworks/simulink-agentic-toolkit)` 后
  `satk_initialize` 即可；不许再写 `D:\AgentRelated` 这类作者本机路径。Windows MCP 组件**不自带运行时**：直接用系统 PATH 里已安装的 `windows-mcp`
  （本机是 uv tool 安装的 0.8.x），插件里不再有 `runtime/windows-mcp` 目录。
  `verify` 会扫描 host/client/scripts 里的作者本机路径，出现即失败。
- **目录树深度**：`gen-catalog.mjs` 的来源节点按 id 深搜（MathWorks其他 下的 Polyspace/示例是三层节点）；
  新增中间节点时只要改 `nodes.zh.json`，不要移动 `skills/engineering/*` 实体目录。
- **飞书 Lark 技能组**：`skills/office/lark/`（28 个领域技能）由本地副本 `vendor/local/lark-skills/` 经
  `layout: local-skills` 生成（这是 vend 脚本专门为“本地多技能副本”加的分支），节点 id `lark` 挂在办公组；
  四个基础技能 `lark-contact/lark-event/lark-im/lark-shared` 默认勾选（`gen-catalog.mjs` 的
  `EXTRA_DEFAULT_SKILLS`），其余飞书技能默认关闭。依赖本机 `lark-cli`（npm 全局 `@larksuite/cli` 并已登录），
  缺失时 `blockedSkills` 把这些技能置灰；每个 SKILL.md 顶部有 headerNotes 说明用 DSH 工具与 `lark-cli`。
  跨技能按 `../lark-shared/` 等相对路径引用，需要相关技能一起勾选才读得到。审计 profile 是 `lark`
  （忽略 cli/env/apiKey 等，凭据由 lark-cli 自己管理）。
