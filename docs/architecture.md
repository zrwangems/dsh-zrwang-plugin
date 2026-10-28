# 架构与关键取舍

## 1 总体形状

```
右侧栏「My DSH」（dsh-better-sidebar 页签）
        │  HTTP /dsh-zrwang-plugin/*
        ▼
宿主半侧 host/
  ├─ catalog.mjs   读 <configDir>/catalog.json 与 defaults.json（种子在包内 catalog/）
  ├─ sessions.mjs  每个会话的一级勾选（新会话三类全关）
  ├─ selection.mjs 全局技能勾选（初值=旧插件启用集合）
  ├─ farm.mjs      按目标集合建/摘目录联接；ppt-master 的 projects 也走链接
  ├─ skill-settings.mjs  .env / TOML / YAML 表单读写与技能配置卡片
  └─ routes.mjs    同源栅栏 + JSON 接口
        │
        ▼
<项目根>/.agents/skills/<技能>  →  插件 skills/<厂商>/<类别>/<技能>
        │
        ▼
DSH 自带 dsh-skill-filesystem 扫描项目技能根（rank 200），watcher 自动刷新
```

## 2 为什么这样做

### 2.1 技能实体只放插件里，不注册、不改 customSkillDirs

DSH 的 skill 提供商只扫描固定根（项目 `.dsh/skills`、`.agents/skills`、custom、用户根），
插件无法按会话动态改变目录。改成：插件不参与 skill 注册，只把「当前会话勾选的技能」
以目录联接放进项目 `.agents/skills/`，让官方 provider 自然发现。

好处：不改任何预设/补丁；勾选立刻生效（watcher 失效目录）；取消只摘链接，实体只有一份。

代价：链接是项目级的，同项目多会话共享一套，以最近一次同步为准。

### 2.2 一级是会话开关，二/三/四是持久选择

用户明确：三类一级默认都不勾；一级不勾时下级选了也不注入；下级选过之后一直沿用。
所以：

- `state/sessions.json`：`sessionId → { projectRoot, categories }`，只记录一级开关；
- `state/selection.json`：`技能名 → 勾选`，全局持久，初值来自 `catalog.defaults`；
- 每一级目录都是注入闸门：点目录只改这一级的开关（存在插件 `state/gates.json`），不改下一级的技能勾选；注入集合 = 所有祖先目录都开启、叶子勾选为 true 且配置就绪的技能并集。未配置的技能在树上禁选，服务端也会跳过。

### 2.3 官方类别作为三级目录

MATLAB 156 个、Simulink 44 个都来自上游 `skills-catalog/<类别>/<技能>`，
`vendor-skills.mjs` 保留类别层级；Polyspace 19 个与 playground 4 个作为与
matlab/simulink 并列的二级目录，默认关。科研下的 zotero-cli、办公下的 ppt-master 与
html-ppt 是独立技能，直接作为二级技能叶子；任何只剩一个技能的类别也会被折叠成技能叶子。

## 3 状态文件与备份

| 文件 | 内容 |
| --- | --- |
| `state/selection.json` | 技能勾选（全局） |
| `state/gates.json` | 目录级注入开关 |
| `state/sessions.json` | 会话一级开关（最多保留 300 个） |
| `state/links.json` | 每个项目由本插件建立的链接清单 |
| `state/ui.json` | 右侧栏展开状态 |
| `state/events.jsonl` | 客户端 apply/打开页签/设置保存事件，用于排查 |
| `state/backups/` | 写技能配置前的原文件备份 |

## 3.1 技能配置

插件设置（供应商、URL/模型/API Key、nature 检索与图片转 PPT 参数）只放在固定配置目录的 `settings.json`（`~/.dsh/zrwang-plugin-config/settings.json`），设置界面保存时写回这里；插件包与 profile 的 `cordis.patch.yml` 都不含设置或密钥。
`<configDir>`（默认 `~/.dsh/zrwang-plugin-config`）只放“文件类”内容：

| 文件 | 内容 |
| --- | --- |
| `settings.json` | 图片服务供应商与 URL/模型/API Key、nature 检索与图片转 PPT 参数 |
| `catalog.json` | 技能目录树（结构+中文文案） |
| `defaults.json` | 默认勾选集合 |
| `nature-downloader/` | 学校访问信息与凭据（技能默认配置目录已改到这里） |

目录开关属于插件运行态，写在插件自己的 `state/gates.json`，不放进配置根。

保存时同时镜像到技能目录里的同名文件，技能本体照常读取；密钥只回 `hasValue`，保存时留空表示沿用旧值。
设置界面只有插件详情页的 `plugins.bundle.config` 一个入口，侧栏页签只负责勾选。

### 3.2 ARS（Academic Research Skills）：固定功能区块

ARS 上游（`Imbad0202/academic-research-skills`，CC-BY-NC-4.0）不是"一堆可选技能"，
是一条完整流水线。所以它**不进技能树、不列子技能**，而是作为技能列表的第四行：和三个技能组
共用同一套门禁机制（`gates.ars`，默认 `false`），勾着就注入 5 个技能，取消就摘除。
`catalog/ars.json` 描述它的 5 个技能与 16 个命令，`mergeArsSkills(desired, enabled)` 按开关并入
注入目标，行内「详情」读 `docs/ars-usage.md`。

上游结构与 DSH 的读取方式冲突：技能正文按**仓库根相对路径**引用 `shared/` 与 `scripts/`，
而 DSH 交给模型的资源根是 `<项目根>/.agents/skills/<技能>`（发现时的路径，含目录联接）。
所以不能原样挂，必须把共享内容打进技能目录，并只用受控改写，保证上游更新时可重放。

```
vendor/upstreams.json 的 ars 条目（outsideCatalog: true，实体落包根 ars/）
  layout: skill-dirs        按名字只取 5 个技能目录，不猜
  target: ars/skills        技能实体在包根 ars/ 下，不混进 skills/ 技能树
  extraDirs: shared→_shared            每个技能一份（约 2.2 MB）
  sharedFiles: MODE_REGISTRY / ARCHITECTURE → _shared/
  scriptClosure: scripts→scripts       按正文引用做 import 闭包，并进技能自带 scripts/
  rewrite: shared/→_shared/、<技能>/→../<技能>/、python3→python、工具名映射
  descriptions: vendor/ars/descriptions.json   技能描述 + 16 条命令中文说明
  aliases: commands/*.md → ars/commands/ 的 16 份命令正文（不进项目、只作命令文本源）
  runtimeRoot: ars                    生成每个技能的 _shared/dsh-runtime.md
  → 生成 catalog/ars.json（技能目录 + 命令清单 + 用法文档位置，skills 带 root: 'package'）
```

| DSH 机制 | Claude Code 里的对应物 | 实现 |
| --- | --- | --- |
| `<项目根>/.agents/skills/` 目录联接 | `~/.claude/skills/<name>` | 第四行勾选（`gates.ars`，默认开）后注入 5 个技能 |
| `/技能名` 注入 | Skill 工具 | 5 个流水线技能直接可用、可自动匹配 |
| `ctx.commands.register` + `agent.followup(userMessage)` | `commands/ars-*.md` 命令展开成提示词 | 16 个原生 `/ars-*` 命令，命令正文取自别名文件 |
| 技能资源根 + 相对路径 | `${CLAUDE_PLUGIN_ROOT}` | 共享内容打进技能目录，引用改写后解析 |
| 会话级 announcement hook | `hooks/SessionStart` | 不实现（侧栏区块已显示注入状态） |
| 写作用域护栏 | `hooks/PreToolUse` + 守护脚本 | 不实现，降级为技能正文规则 |
| 子代理编排 | Task/Agent 工具 | **必须用 DSH 的 Agent Team**（`spawn_teammate` 等）；当前会话没有团队工具时，对应 `/ars-*` 命令直接拒绝执行并提示用户先开启 |

多角色命令的硬门禁：`host/ars-commands.mjs` 在投递前用 `tools.get('spawn_teammate', agent)` 判断当前会话是否挂上 Agent Team。`/ars-full`、`/ars-reviewer`、`/ars-lit-review` 等多角色入口没有团队工具时直接返回错误；`/ars-plan`（单角色苏格拉底对话）、缓存清理、阅读标记不要求。技能正文与运行时说明里也写了同一条规则，避免自然语言触发路径绕过门禁。

ARS 的 Python 解释器由「设置 → ARS 设置」维护：`host/ars.mjs` 负责探测、生成
`_shared/dsh-runtime.md`、检查依赖（PyYAML、jsonschema、ruamel.yaml、pypdf、defusedxml、openpyxl）；
`host/ars-commands.mjs` 负责命令注册与「详情」文档读取。没有 Python 也不影响技能正文，只有校验脚本不可用。

### 3.3 技能文件护栏

技能实体（`skills/` 473 个 + `ars/` 五个技能）都是 vendor 生成的产物，不能被模型在跑任务时改写：
改了会在下次 `vendor-skills.mjs` 重建时被覆盖，或把改写规则改坏而无人察觉。

`host/skill-guard.mjs` 用 DSH 的 `ctx.tools.guard()` 注册一条同步规则：

- 只检查 `write` / `edit` 两个工具（`file_path` 参数）；
- 目标是插件内 `skills/` 或 `ars/` 就拒绝，并提示"改 vendor 规则后重跑 vendor 脚本"；
- 项目 `.agents/skills/<名>` 是目录联接，护栏先 realpath 最近的已存在祖先，所以经联接写入同样被识别；
- `read`/`glob`/`grep` 等只读工具不受影响；shell（`bash`/`pwsh`）不拦——命令串无法在每次执行前
  可靠区分读写，误拦只读命令的代价更大，这一点在文档里明说。

## 3.4 2026-10 新增的 10 个技能仓库

科研、办公两组各新增 5 个上游仓库，共 210 个技能，**默认全部关闭**（不进 `legacy-enabled.json`）。
单技能仓库直接挂成组下一层叶子；多技能仓库先建仓库节点，qinyan 再按上游 18 个分类分子层。

| id | 仓库 | layout / source | 落盘 target | 技能数 | 许可 |
| --- | --- | --- | --- | --- | --- |
| academic-humanizer | AIScientists-Dev/academic-humanizer | root | research/academic-humanizer | 1 | MIT |
| lieflat-less-ai-tone | larashero3-dotcom/lieflat-less-ai-tone | root | research/lieflat-less-ai-tone | 1 | CC BY-NC 4.0 |
| qinyan | LeonChaoX/qinyan-academic-skills | catalog / skills | research/qinyan | 187 | MIT |
| nsfc | njzjz/nsfc-agent-skills | skills / . | research/nsfc | 4 | 无 LICENSE（仅本地） |
| supervisor | HKUSTDial/Supervisor-Skills | skills / skills | research/supervisor-skills | 12 | CC BY-NC-SA 4.0 |
| lieflat-charts | larashero3-dotcom/lieflat-charts | root | office/lieflat-charts | 1 | PolyForm Noncommercial 1.0.0 |
| writing-dna | larashero3-dotcom/writing-dna-skill | root | office/writing-dna-skill | 1 | MIT |
| lieflat-gongwen | larashero3-dotcom/lieflat-gongwen | root | office/lieflat-gongwen | 1 | PolyForm Noncommercial 1.0.0 |
| guizang-ppt | op7418/guizang-ppt-skill | root | office/guizang-ppt-skill | 1 | AGPL-3.0 |
| frontend-slides | zarazhangrui/frontend-slides | root | office/frontend-slides | 1 | MIT |
| patent | handsomestWei/patent-disclosure-skill | skills / skills | research/patent | 9 | MIT |

几处特殊处理：

- **重名改名**：Supervisor 的 `deep-research` 与 ARS 的 `deep-research` 冲突。vendor 配置用
  `renames: { "deep-research": "supervisor-deep-research" }` 改落盘目录，`vendor/skill-patches.json`
  再把 frontmatter 的 `name` 同步改掉；上游其他技能没有引用该目录，改名安全。
- **qinyan 分子层**：上游是 `skills/<01-17 分类 + 沁言学术skills>/<技能>/SKILL.md`，
  vendor 用 `catalog` layout 保留分类，gen-catalog 用 `categories: true` 挂到“沁言学术技能”节点下；
  `nodes.zh.json` 里分类子节点的 **id 必须等于上游目录名**（含数字前缀），title 用中文可读名。
- **writing-dna 内嵌副本**：仓库里 `skills/lieflat-less-ai-tone` 是独立仓库的副本，只收根技能，
  内嵌副本仅作为文件随技能目录带过去，不单列。
- **frontend-slides**：仓库按 Claude 插件打包（`.claude-plugin/` + `plugins/`），技能本体在根
  `SKILL.md`，按单技能收录。
- **体积**：新增约 67 MB（qinyan 21 MB、Supervisor 14 MB、lieflat-charts 23 MB），随包固定发布。

patent-disclosure-skill 收录为 9 个独立技能（交底、申请、案卷、检索、解读、地图、政策简报、审查答复、权利要求对照表），用 `skills` layout 一次枚举、落到 `research/patent/<技能>`。上游子技能正文里的“整仓路径”`skills/<子技能>/…` 由 `rewrite` 改写成同级 `../<子技能>/…`，这样每个技能单独注入后 `tools/`、`prompts/` 等相对路径依然成立；根目录的路由 SKILL.md 不再单独收录。

中文说明与详情：

- 中文短说明由 `node scripts/gen-skill-details.mjs --scan-extras` 在 **vendor 之后、gen-catalog 之前**
  补齐：扫描 `skills/**/SKILL.md`，缺中文行的技能取 description 翻译（已是中文的直接用），
  追加到 `catalog/skills.zh.extra.txt`。
- 中文详情同样由 `scripts/gen-skill-details.mjs` 生成（Google 翻译 description，逐条缓存
  `../AgentsDo/gt-cache/`；中文原文跳过翻译）；详情面板按 Markdown 渲染。

### 3.5 技能选择态（presets，按项目 + 对话）

`host/presets.mjs` 把「每一层注入了什么」存成模式，状态在 `state/presets.json`：

```
{ version: 2, projects: { "<项目根>": {
    baselineStamp,                                   // catalog.generatedAt，用于刷新默认模式
    modes: [{ name, builtin, gates, selection }],    // 默认 + 项目级命名模式
    unnamed: { "<sessionId>": { gates, selection } },// 每个对话最多一个未命名
    active: { "<sessionId>": "<模式名>" }            // 每个对话当前用哪个
} } }
```

- **默认**：项目基础注入态，`gates={}`（所有层级门禁关闭）→ 注入数恒为 0；只读，不因侧栏操作改变；
  仅当 `catalog.generatedAt` 变化（项目/技能集更新）时刷新它的 selection。
- **改动即派生**：`POST /selection`、`POST /session`、`POST /reset` 先 `ensureEditableMode`；
  当前是「默认」就为这个对话建「未命名」（复制当前注入态），之后 `saveActiveMode` 自动保存。
- **未命名**：只存在当前对话的 `unnamed[sessionId]`，别的对话/项目看不到；右键重命名后升级为
  `modes` 里的项目级命名模式。
- **切换模式**：`applyMode` 用模式的 gates + selection 覆盖全局状态；同时写回 `active[sessionId]`。
- **计数**：`modeInjectedCount` 按门禁逐级打开 + 勾选 + 未禁选统计真正注入的技能数。
- **会话隔离**：`syncState` 与所有写接口都先 `activateMode`，把当前对话的模式内容同步到全局
  `selection`/`gates` 再读写；因此两个对话各用各的模式，刷新时不会互相覆盖显示。
- 客户端：底部只渲染 chips（无标题、无新建按钮），右键菜单提供「基于此新建 / 重命名 / 删除」；
  「默认」只显示「基于此新建」。菜单节点挂到 `document.body`（避免被侧栏容器的 overflow 裁剪），
  固定显示在 chip 上方，水平方向按 chip 对齐并夹在视口内。

### 3.6 新增技能的参数与环境变量

`host/skill-settings.mjs` 的 `NEW_SKILL_FIELDS` 定义新增仓库要的密钥（沁言、OpenRouter、Parallel、Zotero），
配置存进 `<configDir>/settings.json` 的 `newSkills`。设置页按用途归并：**模型服务**里是 OpenRouter，
**科研信息**里是沁言学术、Zotero 与 PubMed/NCBI 说明（NCBI 复用 Nature-skill 设置，保存时映射成 `NCBI_EMAIL` / `NCBI_API_KEY`）。

上游这些技能都从环境变量读配置，所以保存时和插件启动时都会调用 `applySkillEnv(params)`，把值写进宿主进程的
`process.env`；模型执行 bash/python 时子进程继承这些变量。未配置沁言 Key 时 10 个 `qinyan-*` 技能、
未配置 Zotero Key/Library ID 时 `pyzotero` 会在侧栏置灰（`blockedSkills`）。

### 3.7 上游仓库链接（GH 按钮）

`host/catalog.mjs` 的 `catalogSources(catalog)` 生成两份映射：

- `bySkill`：技能名 → `https://github.com/<repo>`，只给“项目根”技能（其父节点不属于同一仓库）生成；
- `byNode`：目录节点 → 仓库页，只给“项目根”节点生成（节点下技能同属一个仓库、且父节点不同源）；项目内部的子目录/技能不再重复显示。

客户端在技能行与目录行的动作区渲染「↗」按钮，点击调用宿主 `POST /open-url`：只接受
`https://github.com/<owner>/<repo>` 形式，用系统默认浏览器打开（Windows 走 `cmd /c start`），
避免把任意 URL 交给浏览器。ARS 行用 `catalog/ars.json` 的 `upstream` 字段生成同样的按钮。

### 3.8 上游完整性核对

`scripts/audit-upstreams.mjs` 按 `vendor/upstreams.lock.json` 记录的 SHA 重新下载每个上游包，
逐个技能对比“上游文件清单”与“本地落盘清单”：少文件/少技能报错，多出的文件视为插件增量
（`_shared`、脚本闭包、运行时说明、补丁产物）。跑一遍就能确认 20 个仓库、481 个技能是否完整：

```powershell
node scripts/audit-upstreams.mjs --proxy=http://127.0.0.1:7897
```

## 4 技能版本

技能实体随插件版本固定发布，普通安装和日常使用不会自动更新技能。只有维护者在进行项目级升级时，才统一更新 `skills/`、`catalog/` 和上游锁文件；这些操作不属于面向用户的安装流程。`vendor/upstreams.lock.json` 记录每个技能的来源仓库与提交，`catalog.json` 保留同样的溯源字段。

## 5 明确不做

- 不在 profile 补丁里写任何行（本包补丁只插入自己一行）；
- 不注册 `ctx.skills.register`，不改官方预设的 `customSkillDirs`；
- 不删项目里的真实目录或外部链接；同名冲突只报告；
- 不改 SKILL.md 正文不做手工改写：所有上游改写必须写成 `vendor/` 规则（见 3.2），
  由 `vendor-skills.mjs` 重放；中文只用于界面与说明。

