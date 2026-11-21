# 技能适配记录

这份文档按项目记录 `dsh-zrwang-plugin` 对每个上游技能仓库做了什么改动。原则只有一条：**`skills/` 是生成物，不手工修改**；所有适配都写进 `vendor/`，重跑 `scripts/vendor-skills.mjs` 时重放，升级上游不会丢。

核对时间：2026-11-21。当前收录 22 个上游项目、329 个技能树技能，加上 ARS 5 个流水线技能共 334 个；19 个 GitHub 仓库的 pin 与上游分支 HEAD 一致，3 个是本地副本。

## 一、所有项目共用的改动

### 1. 数据与配置的落点

- 插件运行数据只放 `$DSH_HOME/storages/dsh-zrwang-plugin/`：`state/` 放选择态、会话快照、门禁、模式和缓存；专利数据在用户设置页指定的目录，插件不设默认值。
- 可编辑配置只在 profile 的 `cordis.patch.yml` 的 `config` 段，密钥只在 DSH 凭据库；上游的 `.env`、`config.yaml`、`config.toml`、`credentials.json`、`settings.json` 不再作为配置入口。
- 需要密钥的技能统一读 `ZRWANG_*_CRED`（DSH 的 shell 会清洗名字里带 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 的变量），再由 `host/pysite/sitecustomize.py` 在 Python 进程里映射回上游标准名。
- 上游技能自己写用户主目录、项目 `.agents/`、插件安装目录的代码，逐项删除或改到插件注入了环境变量的位置。

### 2. 统一裁剪

`vendor/removals.json` 删除 102 个不参与运行的文件/目录，按项目分布：

| 项目 | 删除数 | 内容 |
| --- | --- | --- |
| frontend-slides | 80 | `plugins/frontend-slides/` 下与根 `SKILL.md` 重复的 Claude 插件打包树 |
| nature-skills | 17 | academic-search 的 `config/`、`install.sh`、`config.toml`；downloader 的旧 README、school schema、设计文档、`configure_credentials.py` |
| ppt-master | 2 | `.env.example`、`scripts/update_repo.py` |
| patent | 2 | `patent-docket/config.yaml`、`patent-search/config.yaml` |
| writing-dna | 1 | 嵌套的 `skills/lieflat-less-ai-tone/SKILL.md`（该仓库独立收录） |

`vendor-skills.mjs` 另外排除 `.git`、`.github`、`node_modules`、`__pycache__`、`.venv`、tests/CI、包锁、CHANGELOG、`.gitignore` 等；这是所有项目共同执行的规则。

### 3. 描述、语言和工具名

- 329 个技能都有中文短说明，由 `scripts/gen-catalog.mjs` 生成 `catalog/catalog.json`；新增上游技能必须补 `catalog/skills.zh.extra.txt`，否则生成直接失败。
- Claude 工具名按项目改写：`AskUserQuestion` → `ask_user_question`，`WebSearch` → `web_search`，`WebFetch` → `web_fetch`，`python3` → `python`（只改 Markdown 正文；Python 注释里的字面量不影响调用）。
- 每个改过行为的技能在 `SKILL.md` 顶部加一行 `> [dsh-zrwang-plugin] …` 说明，模型先看到的是插件里的真实入口，不是上游默认路径。

## 二、逐项目说明

### 1. MATLAB Agentic Toolkit

- 上游：`matlab/matlab-agentic-toolkit`，pin `863b2489e5ad`，157 个技能，落盘 `skills/engineering/matlab/`。
- 改动：
  - `vendor/upstreams.json` 的 `rewrite`：Markdown 里的 `AskUserQuestion` 改成 `ask_user_question`。
  - `headerNotes`：每个 `SKILL.md` 顶部说明 MATLAB MCP 是 existing 模式，必须先启动 MATLAB 并 `shareMATLABSession()`，不要因为 `failed to attach` 就绕开 MCP；`matlab-call-python`、`matlab-import-external-ai-model` 另加一条：Python 用插件设置选择的解释器（`ZRWANG_SKILL_PYTHON`），不要在 MATLAB 里另建 venv。
  - 本轮上游新增的 `matlab-specify-ssm`、`matlab-design-scenario`、`roadrunner-author-scenario`、`roadrunner-build-rrhd-map`、`roadrunner-simulate-scenario`、`roadrunner-manage-project`、`matlab-simulate-6g-system` 等补了中文说明；被上游删掉的 `configuring-block-policy` 等已从目录和默认集合移除。
- 没改：技能脚本和 MATLAB 代码本身；它们只通过 MCP 调用 MATLAB。
- 验证：`npm run verify`、`npm run smoke`；`audit-upstreams` 157/157。

### 2. Simulink Agentic Toolkit

- 上游：`matlab/simulink-agentic-toolkit`，pin `bdfaf9ac3787`，50 个技能，落盘 `skills/engineering/simulink/`。
- 改动：
  - 与 MATLAB 相同的 `AskUserQuestion` 改写和 existing 模式说明。
  - `simulink-integrate-python-code` 增加 Python 解释器说明。
  - 新增 `simscape-diagnose-simulation-error`、`stateflow-apply-layout` 的中文说明；上游删除的 `configuring-block-policy` 不再收录。
  - 技能树之外的运行时 `mathworks/simulink-agentic-toolkit/` 同步到上游 2026.11.c（`tools/VERSION` 1.0.35），包含 `satk_initialize.p`、`tools/`、`toolbox-kb/`；这部分是 MCP 扩展工具的运行环境，不是技能。
- 没改：MATLAB 函数和 `.p` 文件本身。
- 验证：`VERSION`/`tools/VERSION` 与上游 release 一致；`tools/tools.json` 仍是 9 个 Simulink 工具；`audit-upstreams` 50/50。

### 3. Polyspace Agentic Toolkit

- 上游：`mathworks/polyspace-agentic-toolkit`，pin `7d242a24c9f8`，19 个技能，落盘 `skills/engineering/polyspace/`。
- 改动：只给 `polyspace-agentic-toolkit-setup` 加了顶部说明——DSH 的 MCP 配置在 profile 的 `cordis.patch.yml`，不要改 Claude Code / Cursor / Codex 的配置文件；本机没装 Polyspace 时直接报告不可用，不要下载二进制硬装。
- 没改：技能源码。
- 验证：本机未装 Polyspace，19 个技能在侧栏置灰；`audit-skill-config` 标为 unavailable。

### 4. MATLAB Agent Skills Playground

- 上游：`matlab/agent-skills-playground`，pin `f93265a6477e`，4 个技能，落盘 `skills/engineering/playground/`。
- 改动：每个 `SKILL.md` 加 existing 模式说明，其余不动。
- 验证：`audit-upstreams` 4/4。

### 5. Nature Skills

- 上游：`yuan1z0825/nature-skills`，pin `a65a8364b419`，24 个技能，落盘 `skills/research/nature-skills/`。
- 改动：
  - `vendor/overrides/` 覆盖 28 个文件：
    - `nature-image2ppt`：删除技能内 `config.yaml`/`~/.image2ppt` 的配置读写，OCR 与生图参数只读 `PADDLE_OCR_TOKEN`、`IMAGE2PPT_IMAGE_*`；运行时、生图、manifest、README 一起改。
    - `nature-figure`：绘图后端只读 `NATURE_FIGURE_BACKEND`，不再写 `~/.config/nature-skills`；OpenRouter 配置复用模型服务的生图 URL/模型/Key。
    - `nature-academic-search`：配置类只读 `NCBI_EMAIL`/`NCBI_API_KEY`/`CROSSREF_MAILTO`，不再读 `config.toml`；PubMed 源补丁随上游更新。
    - `nature-downloader`：学校固定北航，读随技能的 `config/school.json`；出版社凭据只读 `DSH_ZRWANG_*_CRED`，不写 credentials/settings 文件。
  - `vendor/skill-patches.json` 保留 3 条小补丁：ImageMagick 探测排除 Windows 的 `convert.exe`（`runtime_env.py`、`formula_renderer.py`）；`nature-academic-search` 的工具清单顶部写明 MCP 未注册、改用 `web_search`/OpenAlex；`nature-citation` 的邮箱默认读 `CROSSREF_MAILTO`/`NCBI_EMAIL`。
  - `rewrite`：Markdown 里的 `WebSearch`/`WebFetch` 改成 `web_search`/`web_fetch`。
  - `headerNotes`：5 个技能各一条，分别说明 image2ppt、学术检索降级、下载器学校/凭据、绘图后端、引用邮箱的来源。
  - 删除 17 个上游文件（academic-search 的 config/安装脚本、downloader 的旧文档和 `configure_credentials.py`），避免模型照旧去找 C 盘配置。
- 验证：`image2ppt doctor`、`preflight.py`、`--list-backends` 显示 process environment；`audit-upstreams` 24/24；配置矩阵 24 项。

### 6. 中国专利技能（patent-disclosure-skill）

- 上游：`handsomestWei/patent-disclosure-skill`，pin `91e3b43a3e6b`，9 个技能，落盘 `skills/research/patent/`。
- 改动：
  - 数据目录统一：设置页「科研服务 → 专利数据目录」是必填项，没有默认值；插件由它派生 `vault/`（Obsidian 库）、`patent-map/`（索引与本地模型）、`oa/`（审查答复）、`outputs/`（三类产物）。没填或路径无效时，9 个专利技能全部不注入并在侧栏置灰。
  - `vendor/overrides/` 覆盖 33 个文件：`patent-oa/tools/config.py`、`patent-map/tools/{map_cache,vault_index,model_store}.py`、`patent-reader/tools/shared/obsidian_env.py` 及 setup/check 脚本、`patent-search`/`patent-docket` 的配置解析、9 个 `SKILL.md` 和相关 prompts/docs。
    - oa / patent-map / patent-reader 只认 `PATENT_OA_HOME` / `PATENT_MAP_HOME` / `PATENT_READER_OBSIDIAN_VAULT`；
    - 删除 `~/Documents/patent-disclosure-skill`、`~/.patent-disclosure-skill`、工作区 `.agents/patent` 三类回退；
    - 删除 `embedding.config.yaml`、`embedding.secrets.yaml`、`obsidian_vault.txt` 的读写，向量模型改由设置页注入；
    - `patent-search`、`patent-docket` 的 `config.yaml` 删除，默认值写进代码。
  - 向量设置改成四项：URL、模型、API Key、维度；provider 固定为 OpenAI 兼容的 `openai_compatible`，插件请求 `<URL>/embeddings`，不再有厂商下拉和预设。
  - `rewrite`：13 条，把正文里的整仓路径 `skills/<子技能>/` 改成同级 `../<子技能>/`，并把 `python3`、`WebSearch`、`WebFetch`、`AskUserQuestion` 换成 DSH 的写法。
  - `headerNotes`：9 个 `SKILL.md` 顶部说明四个子目录和“没设置目录就不注入”。
- 验证：`oa_home()`/`map_home()` 在未设置时直接报错；`smoke` 覆盖“默认无目录时置灰”“空值持久化”“设置后恢复”；`audit-upstreams` 9/9。

### 7. Academic Research Skills（ARS）

- 上游：`Imbad0202/academic-research-skills`，pin `00315dfea67c`（v3.24.4），5 个流水线技能，落盘 `ars/skills/`。
- 改动：
  - `rewrite`：`shared/` → `_shared/`；跨技能路径改 `../<技能>/`；`python3 ` → `python `；`AskUserQuestion`/`WebSearch`/`WebFetch` → `ask_user_question`/`web_search`/`web_fetch`；繁体中文描述改简体。
  - `extraDirs`/`sharedFiles`/`scriptClosure`：每个技能内补 `_shared/`（含 `MODE_REGISTRY.md`、`ARCHITECTURE.md`）和它引用的 `scripts/` 闭包，保证单独注入也能跑。
  - `aliases`：生成 16 个 `/ars-*` 命令；`descriptions`：用 `vendor/ars/descriptions.json` 覆盖过长描述；`runtimeRoot`：构建时写 `_shared/dsh-runtime.md`。
  - `headerNote`：所有技能强制简体中文、多角色用 Agent Team。
  - `vendor/overrides/` 覆盖 5 个 `_shared/dsh-runtime.md`，写清 DSH 的 Python 与工具名。
  - 写作用域：上游的 `PreToolUse` 清单在 `tools/pre-execute` 里实现，写文件前校验允许的目录；详见 `docs/ars-write-scope.md`。
  - 插件注入 `ARS_VERIFICATION_CACHE_PATH=<state>/ars/verification.db`，避免上游默认写 `~/.cache/ars`。
- 验证：`smoke:ars` 25 项；`audit-ars-alignment --strict` 975 个文件中 657 个原样、318 个已知适配；`audit-upstreams` 5/5。

### 8. Zotero CLI

- 上游：`54yyyu/zotero-mcp` 没有 `skills/` 目录，使用 `vendor/local/zotero-cli` 本地副本，落盘 `skills/research/zotero-cli/`。
- 改动：只有 `SKILL.md` 和 `reference.md` 两个文件；使用 Zotero 桌面版本地 API（`ZOTERO_LOCAL=true`），不引入第二套 Zotero 凭据。
- 验证：`zotero-cli config`；Zotero 未启动时由技能提示。

### 9. Academic Humanizer

- 上游：`AIScientists-Dev/academic-humanizer`，pin `94b88b23703b`，1 个技能，落盘 `skills/research/academic-humanizer/`。
- 改动：Markdown 里 `AskUserQuestion` → `ask_user_question`；其余源码不动。
- 验证：`audit-upstreams` 1/1。

### 10. Lieflat Less AI Tone

- 上游：`larashero3-dotcom/lieflat-less-ai-tone`，pin `fe77df00a27c`，1 个技能，落盘 `skills/research/lieflat-less-ai-tone/`。
- 改动：无项目专属改动；只做全局裁剪和描述中文化。
- 验证：`audit-upstreams` 1/1。

### 11. NSFC Agent Skills

- 上游：`njzjz/nsfc-agent-skills`，pin `ac06208c6aa1`，4 个技能，落盘 `skills/research/nsfc/`。
- 改动：无项目专属改动。
- 验证：`audit-upstreams` 4/4。

### 12. Supervisor Skills

- 上游：`HKUSTDial/Supervisor-Skills`，pin `4c718106bd5d`，12 个技能，落盘 `skills/research/supervisor-skills/`。
- 改动：
  - `renames`：上游 `deep-research` 与 ARS 的 `deep-research` 重名，落盘改名 `supervisor-deep-research`。
  - `skill-patches.json` 同步改该技能 frontmatter 的 `name`。
  - `handbook/` 与仓库根 `scripts/` 不收录（不是技能）。
- 验证：`verify` 技能名唯一；`audit-upstreams` 12/12。

### 13. OfficeCLI

- 上游：`iOfficeAI/OfficeCLI`，pin `fecece3ee605`（1.0.163），11 个技能，落盘 `skills/office/officecli/`。
- 改动：技能正文随上游更新，插件不捆绑 `officecli` 命令；没有配置/路径改写。CLI 本身是本机外部安装，版本取决于用户机器。
- 验证：侧栏检查 `officecli --version`；`audit-upstreams` 11/11。

### 14. PPT Master

- 上游：`hugohe3/ppt-master`，pin `63a03673d5c3`，1 个技能，落盘 `skills/office/ppt-master/`。
- 改动：
  - `vendor/overrides/` 覆盖 22 个文件：`scripts/image_gen.py`、`config.py`、`image_search.py`、`notes_to_audio.py`、14 个 `image_backends/*.py`、2 个 `image_sources/*.py`、`scripts/README.md`。
    - 删除 `.env` 查找和加载；生图配置只读插件注入的 `ZRWANG_IMAGE_*`，密钥从 `ZRWANG_IMAGE_CRED` 映射为 `OPENAI_API_KEY`，`IMAGE_BACKEND=openai`；
    - `image_search`/`notes_to_audio` 去掉上游的 `.env` 依赖；
    - 各厂商 backend 保留，但默认走 OpenAI Images 兼容协议。
  - `skill-patches.json` 2 条：`project_management/paths.py` 的 `PROJECTS_ROOT` 改为技能目录 `projects/`，`cli.py` 的默认项目根优先用它；插件把该目录联接到 `<当前项目根>/.agents/ppt-master/projects`。
  - `headerNotes` 3 条：说明生图配置来自插件、`.env` 已禁用、项目输出目录和并发时的绝对路径建议。
  - 删除 `.env.example` 和 `scripts/update_repo.py`。
- 验证：`python scripts/image_gen.py --list-backends` 显示 `process environment`；`project_manager.py init demo` 写到项目 `.agents`；`audit-upstreams` 1/1。

### 15. HTML PPT Skill

- 上游：`lewislulu/html-ppt-skill`，pin `fd1629067909`，1 个技能，落盘 `skills/office/html-ppt/`。
- 改动：无项目专属改动。
- 验证：`audit-upstreams` 1/1。

### 16. 飞书 Lark

- 上游：lark-cli 官方 agent skills（open.feishu.cn well-known 源，MIT），本地副本 `vendor/local/lark-skills`，28 个技能，落盘 `skills/office/lark/`。
- 改动：
  - 每个 `SKILL.md` 顶部说明：文件用 DSH 的 `read`/`write`/`edit`，命令用 `pwsh`/`bash` 执行 `lark-cli`；先安装并 `lark-cli auth login`；文中的 Claude/Codex/Aily harness 对照表仅参考；`../lark-shared/` 等跨技能引用要求一起勾选。
  - 四个基础技能（contact/event/im/shared）默认勾选，其余默认关闭。
  - `lark-cli` 是外部命令，插件不捆绑、不固定版本。
- 验证：`lark-cli --version`、`lark-cli auth status`；缺命令时 28 个技能置灰。

### 17. Archify

- 上游：`tt-a1i/archify` 以 release 包分发、仓库根没有 `SKILL.md`，本地副本固定 v3.2.0，116 个文件，落盘 `skills/office/archify/`。
- 改动：`scripts/check-update.mjs` 覆盖为读取 `ARCHIFY_UPDATE_CHECK_DISABLED` / `DSH_ARCHIFY_UPDATE_CHECK_DISABLED`，插件注入后不再联网检查更新。
- 验证：渲染自检；`audit-upstreams` 标为本地副本。

### 18. Lieflat Charts

- 上游：`larashero3-dotcom/lieflat-charts`，pin `4b4e75bde11c`，1 个技能，落盘 `skills/office/lieflat-charts/`。
- 改动：无项目专属改动；本轮上游删除了 6 个旧 deck 模板并调整了 Lupi 图表集，按上游原样收录。
- 验证：`audit-upstreams` 1/1。

### 19. Writing DNA

- 上游：`larashero3-dotcom/writing-dna-skill`，pin `1335568bfd11`，1 个技能，落盘 `skills/office/writing-dna-skill/`。
- 改动：`vendor/overrides/` 覆盖 4 个文件（`SKILL.md`、`README.md`、`README.en.md`、`references/workflow.en.md`），做中文说明和 DSH 入口适配；删除仓库里嵌套的 `lieflat-less-ai-tone` 副本（该仓库已独立收录）。
- 验证：`audit-upstreams` 1/1。

### 20. Lieflat Gongwen

- 上游：`larashero3-dotcom/lieflat-gongwen`，pin `c17e885c5579`，1 个技能，落盘 `skills/office/lieflat-gongwen/`。
- 改动：无项目专属改动。
- 验证：`audit-upstreams` 1/1。

### 21. Guizang PPT Skill

- 上游：`op7418/guizang-ppt-skill`，pin `93d21bf4a73a`，1 个技能，落盘 `skills/office/guizang-ppt-skill/`。
- 改动：无项目专属改动。
- 验证：`audit-upstreams` 1/1。

### 22. Frontend Slides

- 上游：`zarazhangrui/frontend-slides`，pin `9906a34d640d`，1 个技能，落盘 `skills/office/frontend-slides/`。
- 改动：仓库按 Claude 插件打包，技能本体在根 `SKILL.md`；只收录根技能，删除 `plugins/frontend-slides/` 下重复的 80 个文件。技能正文本身不改。
- 验证：`audit-upstreams` 1/1。

## 三、MCP 组件

技能之外还有两个 MCP 组件，不按技能计数：

### MathWorks（`matlab-mcp`）

- 包内 `mathworks/matlab-mcp-server-windows-x64.exe` 是 MathWorks 官方 MATLAB MCP 服务器，已更新到 **v0.16.1**（sha256 `7feca987…`，与官方 release 一致）。
- 包内 `mathworks/simulink-agentic-toolkit/` 是 Simulink Agentic Toolkit 运行时 **2026.11.c**（`tools/VERSION` 1.0.35），提供 `tools/tools.json` 里的 9 个 Simulink 工具；加上 MCP 服务器的 5 个 MATLAB 工具，共 14 个。
- 注册参数固定：existing 会话模式、`--extension-file=<包内 tools.json>`、关闭 telemetry；工程技能组打开且确有工程技能注入时才动态注册，MATLAB 没启动时只报连接状态，不拖垮插件装配。
- MATLAB 侧需要用户执行一次 `satk_initialize(MCPServerPath=...)` 共享会话；插件不会自动拉起 MATLAB。

### Windows MCP（`windows-mcp`）

- 插件只负责在侧栏勾选后注册 `windows-mcp`（`serve` + 两个固定 env），**不捆绑、不固定版本**；命令必须由用户自己安装到 PATH（例如 `uv tool install windows-mcp`）。版本是否最新取决于用户机器，插件无法替它升级。

### 外部依赖（不是 MCP）

- `officecli`、`lark-cli`、`zotero-cli`、draw.io、Polyspace 都是本机外部安装或商业软件，插件只检测可用性并在缺失时置灰，不会自动下载安装。

## 四、升级或新增项目时怎么做

1. 在 `vendor/upstreams.json` 加仓库、pin、落盘路径和需要的 `rewrite`/`headerNotes` 等规则。
2. 需要小范围字面替换的，写进 `vendor/skill-patches.json`；需要整文件改的，放 `vendor/overrides/`；要删的上游文件登记到 `vendor/removals.json`；没有仓库形态的做 `vendor/local/` 副本。
3. 跑 `node scripts/vendor-skills.mjs --only=<id>`，再跑 `npm run catalog`、`npm run build`。
4. 更新本文件对应项目、`AgentsDo/upstream-adaptation-record/upstream-inventory.md`、`upstream-modifications.md`、`records.json` 和 `verification-log.md`。
5. 跑完整检查：

```text
npm run verify
npm run smoke
node scripts/smoke-routes.mjs
node scripts/audit-skill-config.mjs --check
node scripts/audit-upstreams.mjs
node scripts/smoke-ars-guard.mjs
```

当前结果：`verify` 81 项、`smoke` 82 项、路由 smoke 全过、配置审计 329 技能/16 组件待处置 0、上游完整性缺技能 0 缺文件 0、ARS 护栏 25 项、ARS 对齐 975 文件中原样 657/已知适配 318。

## 五、为什么很多上游文件看起来没改

这是有意的。只改 DSH 与上游真正不兼容的地方：配置入口、数据目录、密钥传递、工具名、Windows 兼容性和跨技能路径。其余文件保持逐字节一致，升级时 diff 才看得清哪些是上游变化、哪些是插件改动。

`audit-upstreams` 会按 lock SHA 重新下载每个上游，逐个技能对比文件清单：少文件才算不完整，多文件允许（`_shared`、脚本闭包、运行说明、补丁产物）。ARS 的 975 个文件里 657 个原样保留，318 个是有记录的适配，说明“没改”和“改了”都有账可查。

## 六、已知限制

- 没有在真实 Windows + MATLAB 上跑 Simulink 的 `.p` 工具和 MCP 连接，只核对了版本、文件结构和工具清单；最终要在用户的 MATLAB 会话里验证。
- `officecli`、`lark-cli`、`windows-mcp`、draw.io、Polyspace 的版本由用户机器决定，插件只检测、不升级。
- 专利向量接口没有在真实服务上调用过，只验证了配置解析和请求构造；文本嵌入即可，不需要多模态。
- 上游默认分支会继续移动；本文件记录的是 2026-11-21 的 pin，升级时以 `vendor/upstreams.lock.json` 为准。
