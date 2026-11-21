# 技能适配记录

`skills/` 下的技能**不是上游仓库的原样副本**。每个技能接入前都要按本插件（DSH + 插件门禁/注入机制）的特性做适配，不能直接照搬上游代码与内容；适配过程与结果记录在本文件，新接入、升级或修改技能时同步更新。

## 适配原则

1. 技能内容以「由 DSH 的 `ctx.skills` 提供方单独加载后仍能正常工作」为准，不能依赖上游仓库的整仓结构，也不依赖项目里的 `.agents/skills`。
2. 需要配置的东西（API Key、模型、账号、学校信息等）优先走插件设置页或随包固定配置，不让用户手改技能里的 `.env`、`config.*`。
3. 上游用 Claude Code / Codex 的工具名、命令名、多角色方式，要换成 DSH 的对应能力（`ask_user_question`、`web_search`、`web_fetch`、`skill`、`subagent` / Agent Team 等）。
4. 所有改写必须通过 vendor 机制重放：
   - `vendor/upstreams.json`：`rewrite`、`renames`、`aliases`、`headerNote`、`extraDirs`、`sharedFiles`、`scriptClosure`、`descriptions`、`runtimeRoot`；
   - `vendor/skill-patches.json`：字面替换类小改动；
   - `vendor/overrides/`：整文件适配版本，vendor 最后一步覆盖到 `skills/`、`ars/`；`vendor/removals.json` 列出要删掉的上游多余文件。大改（删除配置读写、改数据目录、重写脚本）放这里，重跑 vendor 不会丢；
   - `vendor/local/*`：以 release 包/本地副本形式维护的上游（archify、zotero-cli）。
5. 每次适配在本文件登记：改了什么、为什么、涉及哪些文件或规则。

## 逐技能适配记录

| 技能 / 仓库 | 上游形态 | 适配内容 |
| --- | --- | --- |
| `ppt-master`（hugohe3/ppt-master） | 用 `.env` 配置生图模型与 Key；项目目录按仓库根/`cwd` 算 | 设置页「模型服务 → 生图模型」只保留 URL / 模型 / API Key（OpenAI Images 兼容协议，不分厂商）；插件通过 `ctx.shellEnv` 注入 `DSH_ZRWANG_IMAGE_*` 与 `DSH_ZRWANG_IMAGE_CRED`；DSH 的 shell 子进程会按变量名清洗 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 类变量，所以密钥用 `_CRED`，再由 `host/pysite/sitecustomize.py` 映射回 `OPENAI_*`/`QWEN_*`；`config.py` 删除了 `.env` 查找与 `ENV_PATH`，`image_gen.py`/`image_search.py`/`notes_to_audio.py` 删除全部 `.env` 加载代码，**不写 `~/.ppt-master/.env`**；`PROJECTS_DIR` 改为 `ZRWANG_PPT_PROJECTS` 或 `<cwd>/.agents/ppt-master/projects`；删除 `.env.example` 与 `update_repo.py`；SKILL.md 与配置文档顶部加说明 |
| `nature-image2ppt` | 读 `config.yaml` 的 OCR/生图配置；用 `shutil.which("convert")` 判断 ImageMagick | 删除 `runtime_env.py` 的配置路径/读写与 `config` 子命令、`image_gen.py` 的运行时 env 加载、`config.example.yaml`；OCR/生图参数只从插件注入的环境变量读（`PADDLE_OCR_TOKEN`、`IMAGE2PPT_IMAGE_*`）；`doctor` 纳入设置页检查；补丁排除 `C:\Windows\System32\convert.exe` 的假 ImageMagick |
| `nature-academic-search` | 主路径依赖 academic-search / paper-search / pubmed MCP | 本 DSH 未注册这些 MCP：`static/core/tools.md` 与 SKILL.md 顶部写明降级为 `web_search`/`web_fetch` + OpenAlex CLI + preflight；`mcp-server/utils/config.py` 只读 `NCBI_EMAIL`/`PUBMED_EMAIL`/`NCBI_API_KEY`/`CROSSREF_MAILTO`，删除 `config/` 目录与 `install.sh`，不再有 `config.toml` |
| `nature-figure` | 绘图后端偏好写 `~/.config/nature-skills` | `scripts/nature_figure_backend.py` 只打印 `NATURE_FIGURE_BACKEND`（`get` 不再 `set/clear`）；后端偏好只由设置页「科研服务 → Nature 绘图」决定，删除 `~/.config/nature-skills` 持久化与相关文档表述 |
| `nature-downloader`（yuan1z0825/nature-skills） | 默认读 `~/.dsh/zrwang-plugin-config/nature-downloader/school.json` | 学校信息固定为北航，直接随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`；插件通过 `LIT_DL_SCHOOL_FILE` 指向它，不复制到 `~/.dsh`；出版社凭据只从设置页写入 DSH 凭据库，再以 `ZRWANG_*_CRED` 注入；删除 `src/wizard.py`、`src/schools_loader.py`、`scripts/configure_credentials.py`、`scripts/configure_school.py`、`data/schools.yaml`、`lib/settings.mjs` 与 `credentials.json`/`settings.json` 读写 |
| `patent`（handsomestWei/patent-disclosure-skill） | 默认写 `~/Documents/patent-disclosure-skill/`、`~/.patent-disclosure-skill/` | oa / patent-map / patent-reader 三个配置解析器补丁：只认插件注入的 `PATENT_OA_HOME` / `PATENT_MAP_HOME` / `PATENT_READER_OBSIDIAN_VAULT`（都在设置页「科研服务 → 专利数据目录」下，Obsidian 库是 `vault/`）；删除 `~/Documents/patent-disclosure-skill`、`~/.patent-disclosure-skill`、项目 `.agents/patent/` 三类回退，以及 `embedding.config.yaml`/`embedding.secrets.yaml` 读写，向量模型改由设置页「科研服务 → 专利检索向量模型」注入 `PATENT_EMBEDDING_*` 与 `ZRWANG_PATENT_EMBEDDING_CRED`，索引指纹存在 `<专利数据目录>/oa/embedding-state.json`；删除 `obsidian_vault.txt` 持久化与 `--set/--setx`；`patent-search`、`patent-docket` 的 `config.yaml` 删除，默认值写进代码；SKILL.md 顶部说明数据目录；没设置专利数据目录时插件不注入这些技能；整仓路径改 `../<子技能>/` |
| `MATLAB / Simulink / playground`（MathWorks） | 依赖 MATLAB MCP | 本机 profile 的 MCP 是 existing 模式：SKILL.md 顶部说明需先启动 MATLAB 并 `shareMATLABSession()`，不要绕开 MCP |
| `Polyspace`（mathworks/polyspace-agentic-toolkit） | 依赖 Polyspace MCP 与 Polyspace 安装 | 本机未安装：技能置灰；setup 技能顶部说明 DSH 的 MCP 配置在 profile `cordis.patch.yml`，不要改 Claude/Cursor/Codex 配置 |
| `ARS`（Imbad0202/academic-research-skills） | 整仓 `shared/`、`scripts/`，工具名面向 Claude Code，繁体中文输出；当前 pin v3.24.4 / `00315df` | 逐个文件复制后只做机械适配：`shared/`→`_shared/`、跨技能路径改 `../<技能>/`、`python3`→`python`、`AskUserQuestion`→`ask_user_question`、`WebSearch`/`WebFetch`→`web_search`/`web_fetch`、繁体→简体；`headerNote` 强制简体中文与 Agent Team 多角色；每个技能补 `_shared/`（含 `MODE_REGISTRY`、`ARCHITECTURE`）与 `.md`/`.json` 引用到的 `scripts/` 闭包（测试/fixture 不分发）；16 个 `/ars-*` 命令保留上游模式说明，清掉 Claude Skill 工具与 `${CLAUDE_PLUGIN_ROOT}` 写法；`vendor/ars/descriptions.json` 覆盖描述；写作用域清单原样复制并在 `tools/pre-execute` 里实现上游 `PreToolUse` 护栏；`_shared/dsh-runtime.md` 构建时生成。对齐审计：`node scripts/audit-ars-alignment.mjs --upstream=<ARS 检出> --strict`，结果与 Claude hooks 对照写在 `docs/ars-alignment.md` |
| `Supervisor Skills`（HKUSTDial/Supervisor-Skills） | 上游技能名 `deep-research` 与 ARS 重名 | `renames` 落盘为 `supervisor-deep-research`，frontmatter 由 `vendor/skill-patches.json` 同步 |
| 专利技能（handsomestWei/patent-disclosure-skill） | 正文按仓库根路径 `skills/<子技能>/` 引用 | 13 条 rewrite 改成 `../<子技能>/`，保证每个子技能单独注入时路径仍成立 |
| `飞书 Lark`（open.feishu.cn lark-cli skills，28 技能） | 官方 agent skills，正文面向 Claude/Codex/Aily 等 harness，跨技能按 `../lark-shared/` 等相对路径引用 | 固定本地副本 `vendor/local/lark-skills`（MIT，Lark Technologies，许可证归档 `vendor/licenses/lark/`）；每个 `SKILL.md` 顶部 headerNotes 说明：文件用 DSH `read`/`write`/`edit`、命令用 `pwsh`/`bash` 执行 `lark-cli`、需先安装并 `lark-cli auth login`、harness 对照表仅参考、相关技能一起勾选；四个基础技能默认勾选，其余默认关闭 |
| 其余仓库 | 技能可单独运行 | 只做描述中文化与必要路径处理；如发现问题按上面的原则补适配并登记到本表与 `AgentsDo/upstream-adaptation-record/upstream-modifications.md` |

## 新增 / 升级技能检查清单

1. `SKILL.md` 的 `name` / `description` 可用，中文短说明与详情已生成。
2. 正文里的相对路径在「技能单独注入」时成立；需要时补 `extraDirs` / `sharedFiles` / `scriptClosure` / `rewrite`。
3. 上游专用工具名、命令名已换成 DSH 对应能力；多角色流程写明用 Agent Team。
4. 需要配置的项已改走插件设置页或随包固定配置，不要求用户改技能目录里的文件。
5. 对技能的大改已放进 `vendor/overrides/`，删除的上游文件已登记到 `vendor/removals.json`；重跑 `npm run vendor` 后 `git status` 不应出现技能内容漂移。
6. 上游许可已归档到 `vendor/licenses/<仓库>/`，并在 README「技能来源」标注协议。
7. 跑 `vendor --only=…`、`gen-catalog`、`gen-skill-details`、`verify`、`smoke-host`，通过后更新本文件。

## 上游文件的裁剪

技能包里只保留运行需要的内容：`SKILL.md`、正文/脚本实际引用的资源、脚本闭包、许可文件。以下上游内容在 vendor 时会删掉（移到 `AgentsDo` 的 trash，可回滚，规则见 `scripts/vendor-skills.mjs` 的 `PRUNE_*`）：

- `tests/`、`test/`、`__pycache__/`、`.pytest_cache/`、`.venv/`、`.github/`、`ci/`、`.vscode/`
- `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`.gitignore`、`.gitattributes`
- `CHANGELOG*`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`codecov.yml`、`requirements-dev.txt`、`requirements-test.txt`、`.pre-commit-config.yaml`、`.eslintrc*`、`*.pyc`

需要时也可以手动跑 `node scripts/vendor-skills.mjs --prune-only` 对现有 `skills/` 做一次裁剪。

## 运行环境适配

以下不是对某个上游技能的改写，而是让所有技能在 DSH（Web / Desktop）下可运行的环境适配：

- **配置只有一个来源**：非密钥写进当前 profile 的 `cordis.patch.yml`（`- id: dsh-zrwang-plugin` 的 `config`），密钥写进 DSH 凭据库；没有 `settings.json`、没有插件配置目录、没有上游 `.env`/`config.*`。设置页的所有字段保存后立即重新注入环境变量。
- **技能注入**：不再使用 `<项目根>/.agents/skills` 目录联接；插件在每个 agent 的 `agent/created` 里用 `ctx.skills.registerProvider` 注册提供方，闭包绑定该会话的 sessionId；选择快照存在 `$DSH_HOME/storages/dsh-zrwang-plugin/state/session-selection.json`，`get()` 按需读取插件包内 `SKILL.md`。旧版本留下的、指回插件 `skills/`/`ars/` 的联接会在首次按项目列出时自动摘掉。DSH 官方查找参数只有 `cwd`，但提供方注册在 agent 作用域，所以不同对话各用各的选择。
- **MCP 组件会话隔离**：组件开关按会话保存；服务器仍由 `ctx.mcpManager` 宿主级注册（DSH 的工具表是宿主级），插件在每个 agent 作用域调用 `ctx.tools.restrict({ deny })`，把本会话没启用的 `mcp__matlab-mcp__*` / `mcp__windows-mcp__*` 从工具列表、提示词上下文和执行里一起移除；`tools/change` 时按当前工具名重算，MATLAB 重连换了工具名也能跟上。
- **配置注入**：不再手工改宿主进程环境；插件通过 DSH 官方 `ctx.shellEnv.register` 注册 `DSH_ZRWANG_*`，每次 shell 调用由 DSH 注入。DSH shell 会按变量名清洗 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 类变量，所以密钥用 `_CRED` 结尾的名字；`host/pysite/sitecustomize.py` 在 Python 启动时把它们映射回 `OPENAI_API_KEY`、`QWEN_API_KEY`、`NCBI_API_KEY`、`ELSEVIER_API_KEY`、`ZHIPUAI_API_KEY` 等上游标准名，非密钥的 `DSH_ZRWANG_*`、`DSH_PATENT_*`、`DSH_NCBI_*` 等插件声明的前缀则去掉 `DSH_` 还原成上游变量名（只处理这些前缀，不动 `DSH_HOME` 这类宿主内置）。Nature 生图复用模型服务的生图 URL/模型/Key，不再单独设置，不设全局 `OPENAI_API_KEY`。
- **系统 Python（不自带、不安装）**：插件不再自带 `runtime/python`，也不提供任何安装功能；`host/python.mjs` 检测本机 Python（PATH、`py` 启动器、Conda、常见目录），设置 → 运行环境 → Python 解释器 里下拉选择并只读校验依赖（缺包只提示）。所有技能的 `python`/`python3` 由静态的 `host/shim/python` 指向所选解释器，`bash`/`sh` 由 `host/shim/bash` 指向 Git Bash（Windows）或系统 bash；不在 `skills/`/`ars/` 下建 venv。
- **运行期文件只在 DSH storages**：`$DSH_HOME/storages/dsh-zrwang-plugin/state/`（选择态、门禁、模式、事件）与 `.../patent/` 只是建议的专利数据位置；设置页「专利数据目录」填了才用，目录里是 `vault/`、`patent-map/`、`oa/`、`outputs/`。这是 DSH `storage-json` 后端的根，插件升级不丢；插件包内不再产生 `cache/`，`~/.dsh` 里也不再出现 `zrwang-plugin-config/` 之类的旁目录。旧版 `cache/` 首次启动时搬到 storages 后删除。
- **MATLAB MCP**：profile 使用 existing 模式；MATLAB/Simulink/playground 技能顶部注明需先启动 MATLAB 并 `shareMATLABSession()`；`matlab-mcp` 与 `windows-mcp` 只在 Windows 上可用，其他平台组件显示不可用。
- **专利工作目录**：只认设置页的「专利数据目录」；Obsidian 库固定是它下面的 `vault/`，索引与模型在 `patent-map/`，审查答复在 `oa/`，产物在 `outputs/`。目录没设置、是相对路径、指向文件或放在插件安装目录里时，9 个专利技能一律置灰、不注入。
- **组件置灰**：本机未安装 draw.io、Polyspace 时，对应技能在侧栏置灰并给出原因，不静默失败。

## 适配记录

以上所有改动的详细台账、逐技能覆盖矩阵与验证日志在 `AgentsDo/upstream-adaptation-record/`：

- `README.md`：升级前必读、更新流程；
- `upstream-modifications.md`：每个仓库/技能改了什么、为什么、怎么验证；
- `skill-config-matrix.md`：329 个技能 + 16 个组件的状态；
- `records.json`：最后审计的上游 SHA，`verify` 会与 lock 比对；
- `verification-log.md`：检查命令与结果。

升级任何上游前必须先读该目录；改完 vendor 规则后必须同步更新，否则 `node scripts/verify.mjs` 会失败。
