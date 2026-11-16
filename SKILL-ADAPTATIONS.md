# 技能适配记录

`skills/` 下的技能**不是上游仓库的原样副本**。每个技能接入前都要按本插件（DSH + 插件门禁/注入机制）的特性做适配，不能直接照搬上游代码与内容；适配过程与结果记录在本文件，新接入、升级或修改技能时同步更新。

## 适配原则

1. 技能内容以「单独注入到 `<项目根>/.agents/skills/<技能>` 后仍能正常工作」为准，不能依赖上游仓库的整仓结构。
2. 需要配置的东西（API Key、模型、账号、学校信息等）优先走插件设置页或随包固定配置，不让用户手改技能里的 `.env`、`config.*`。
3. 上游用 Claude Code / Codex 的工具名、命令名、多角色方式，要换成 DSH 的对应能力（`ask_user_question`、`web_search`、`web_fetch`、`skill`、`subagent` / Agent Team 等）。
4. 所有改写必须通过 vendor 机制重放，**不手改 `skills/` 产物**：
   - `vendor/upstreams.json`：`rewrite`、`renames`、`aliases`、`headerNote`、`extraDirs`、`sharedFiles`、`scriptClosure`、`descriptions`、`runtimeRoot`；
   - `vendor/skill-patches.json`：改名后的 frontmatter 等；
   - `vendor/local/*`：以 release 包/本地副本形式维护的上游（archify、zotero-cli）。
5. 每次适配在本文件登记：改了什么、为什么、涉及哪些文件或规则。

## 逐技能适配记录

| 技能 / 仓库 | 上游形态 | 适配内容 |
| --- | --- | --- |
| `ppt-master`（hugohe3/ppt-master） | 用 `.env` 配置生图模型与 Key；项目目录按仓库根/`cwd` 算 | 设置页「模型服务 → 生图模型」只保留 URL / 模型 / API Key（OpenAI Images 兼容协议，不分厂商）；`applySkillEnv` 注入 `ZRWANG_IMAGE_*`，`image_gen.py` 顶部桥接补丁映射成 `OPENAI_*` 并固定 `IMAGE_BACKEND=openai`；DSH 的 shell 子进程会按变量名清洗 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 类变量（`@deepseek-ai/dsh-subprocess-local` 的凭据清洗启发式），所以密钥不能再只靠环境变量传递；插件生成 `<state>/python/sitecustomize.py`，在技能用的 Python 启动时从 `settings.json` 把密钥补回 `os.environ`（PPT 生图另有 `image_gen.py` 自身的文件兜底）；`config.py` 已禁用上游 `.env` 查找，**不写 `~/.ppt-master/.env`**；`paths.py`/`cli.py` 补丁优先使用插件维护的 `projects/` 联接；SKILL.md 与配置文档顶部加说明 |
| `nature-image2ppt` | 读 `config.yaml` 的 OCR/生图配置；用 `shutil.which("convert")` 判断 ImageMagick | 配置由设置页写入技能目录 `config.yaml`；`doctor` 纳入设置页检查；补丁排除 `C:\Windows\System32\convert.exe` 的假 ImageMagick |
| `nature-academic-search` | 主路径依赖 academic-search / paper-search / pubmed MCP | 本 DSH 未注册这些 MCP：`static/core/tools.md` 与 SKILL.md 顶部写明降级为 `web_search`/`web_fetch` + OpenAlex CLI + preflight；`config.toml` 由设置页写入 |
| `nature-figure` | 绘图后端偏好写 `~/.config/nature-skills` | `NATURE_FIGURE_CONFIG` 指向插件配置目录，并兜底 `{backend:"python"}` |
| `nature-downloader`（yuan1z0825/nature-skills） | 默认读 `~/.dsh/zrwang-plugin-config/nature-downloader/school.json` | 学校信息固定为北航，直接随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`；插件通过 `LIT_DL_SCHOOL_FILE` 指向它，不复制到 `~/.dsh`；出版社凭据/邮箱仍走 `LIT_DL_CONFIG_DIR` |
| `patent`（handsomestWei/patent-disclosure-skill） | 默认写 `~/Documents/patent-disclosure-skill/`、`~/.patent-disclosure-skill/` | oa / patent-map / patent-reader 三个配置解析器补丁：项目内 `.agents/patent/` 优先，无项目时落插件配置目录；SKILL.md 顶部加工作目录说明；整仓路径改 `../<子技能>/` |
| `MATLAB / Simulink / playground`（MathWorks） | 依赖 MATLAB MCP | 本机 profile 的 MCP 是 existing 模式：SKILL.md 顶部说明需先启动 MATLAB 并 `shareMATLABSession()`，不要绕开 MCP |
| `Polyspace`（mathworks/polyspace-agentic-toolkit） | 依赖 Polyspace MCP 与 Polyspace 安装 | 本机未安装：技能置灰；setup 技能顶部说明 DSH 的 MCP 配置在 profile `cordis.patch.yml`，不要改 Claude/Cursor/Codex 配置 |
| `ARS`（Imbad0202/academic-research-skills） | 整仓 `shared/`、`scripts/`，工具名面向 Claude Code，繁体中文输出 | 18 条 rewrite：`shared/`→`_shared/`、跨技能路径改 `../<技能>/`、`python3`→`python`、`AskUserQuestion`→`ask_user_question`、`WebSearch`→`web_search`、`WebFetch`→`web_fetch`、繁体→简体；`headerNote` 强制简体中文与 Agent Team 多角色；补 `_shared/`、脚本闭包；16 个 `/ars-*` 命令别名；`vendor/ars/descriptions.json` 覆盖描述；`runtimeRoot` 写 `_shared/dsh-runtime.md`（含 python/bash shim 说明） |
| `Supervisor Skills`（HKUSTDial/Supervisor-Skills） | 上游技能名 `deep-research` 与 ARS 重名 | `renames` 落盘为 `supervisor-deep-research`，frontmatter 由 `vendor/skill-patches.json` 同步 |
| 专利技能（handsomestWei/patent-disclosure-skill） | 正文按仓库根路径 `skills/<子技能>/` 引用 | 13 条 rewrite 改成 `../<子技能>/`，保证每个子技能单独注入时路径仍成立 |
| `飞书 Lark`（open.feishu.cn lark-cli skills，28 技能） | 官方 agent skills，正文面向 Claude/Codex/Aily 等 harness，跨技能按 `../lark-shared/` 等相对路径引用 | 固定本地副本 `vendor/local/lark-skills`（MIT，Lark Technologies，许可证归档 `vendor/licenses/lark/`）；每个 `SKILL.md` 顶部 headerNotes 说明：文件用 DSH `read`/`write`/`edit`、命令用 `pwsh`/`bash` 执行 `lark-cli`、需先安装并 `lark-cli auth login`、harness 对照表仅参考、相关技能一起勾选；四个基础技能默认勾选，其余默认关闭 |
| 其余仓库 | 技能可单独运行 | 只做描述中文化与必要路径处理；如发现问题按上面的原则补适配并登记到本表与 `AgentsDo/upstream-adaptation-record/upstream-modifications.md` |

## 新增 / 升级技能检查清单

1. `SKILL.md` 的 `name` / `description` 可用，中文短说明与详情已生成。
2. 正文里的相对路径在「技能单独注入」时成立；需要时补 `extraDirs` / `sharedFiles` / `scriptClosure` / `rewrite`。
3. 上游专用工具名、命令名已换成 DSH 对应能力；多角色流程写明用 Agent Team。
4. 需要配置的项已改走插件设置页或随包固定配置，不要求用户改技能目录里的文件。
5. 上游许可已归档到 `vendor/licenses/<仓库>/`，并在 README「技能来源」标注协议。
6. 跑 `vendor --only=…`、`gen-catalog`、`gen-skill-details`、`verify`、`smoke-host`，通过后更新本文件。

## 上游文件的裁剪

技能包里只保留运行需要的内容：`SKILL.md`、正文/脚本实际引用的资源、脚本闭包、许可文件。以下上游内容在 vendor 时会删掉（移到 `AgentsDo` 的 trash，可回滚，规则见 `scripts/vendor-skills.mjs` 的 `PRUNE_*`）：

- `tests/`、`test/`、`__pycache__/`、`.pytest_cache/`、`.venv/`、`.github/`、`ci/`、`.vscode/`
- `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`.gitignore`、`.gitattributes`
- `CHANGELOG*`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`codecov.yml`、`requirements-dev.txt`、`requirements-test.txt`、`.pre-commit-config.yaml`、`.eslintrc*`、`*.pyc`

需要时也可以手动跑 `node scripts/vendor-skills.mjs --prune-only` 对现有 `skills/` 做一次裁剪。

## 运行环境适配

以下不是对某个上游技能的改写，而是让所有技能在 DSH + Windows 下可运行的环境适配：

- **生图配置**：设置页只保留 URL / 模型 / API Key；`applySkillEnv` 注入 `ZRWANG_IMAGE_*`；DSH shell 会按变量名清洗 `KEY` 类变量，因此插件生成 `sitecustomize.py` 在 Python 进程启动时把 `settings.json` 里的密钥（生图、OpenRouter、Pexels/Pixabay/OpenAlex、Firecrawl、NCBI）补回环境变量，PPT 的 `image_gen.py` 桥接补丁也保留 `settings.json` 文件兜底；`config.py` 已禁用上游 `.env` 查找；不写 `~/.ppt-master/.env`。`nature-image2ppt` 读插件配置目录的 `config.yaml`。Nature 生图直接复用模型服务的生图 URL/模型/Key（`OPENROUTER_*` / `SCHEMATIC_IMAGE_API_URL` 由同一份配置派生），不再单独设置。不设全局 `OPENAI_API_KEY`。
- **系统 Python（不自带、不安装）**：插件不再自带 `runtime/python`，也不提供任何安装功能；`host/python-detect.mjs` 检测本机 Python（PATH、py 启动器、Conda、常见目录），设置 → 运行环境 → Python 解释器 里选择/填自定义路径并只读校验依赖（缺包只提示）。所有技能的 `python`/`python3` 由插件 shim 指向所选解释器，`bash` 指向 Git Bash；不在 `skills/`/`ars/` 下建 venv。
- **配置集中**：`nature-academic-search/config.toml`、`nature-image2ppt/config.yaml`、`nature-figure.json`、`nature-downloader/{credentials,settings}.json` 都放在 `~/.dsh/zrwang-plugin-config/`；学校配置固定为北航，直接随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`，通过 `LIT_DL_SCHOOL_FILE` 读取，不复制。学术/下载相关邮箱与可选 Key 通过 `NCBI_EMAIL`、`UNPAYWALL_EMAIL`、`CROSSREF_MAILTO`、`FIRECRAWL_API_KEY` 注入，不再写回技能目录。
- **MATLAB MCP**：profile 使用 existing 模式；MATLAB/Simulink/playground 技能顶部注明需先启动 MATLAB 并 `shareMATLABSession()`。
- **专利工作目录**：项目内 `.agents/patent/` 优先；无项目时落插件配置目录。
- **组件置灰**：本机未安装 draw.io、Polyspace 时，对应技能在侧栏置灰并给出原因，不静默失败。

## 适配记录

以上所有改动的详细台账、逐技能覆盖矩阵与验证日志在 `AgentsDo/upstream-adaptation-record/`：

- `README.md`：升级前必读、更新流程；
- `upstream-modifications.md`：每个仓库/技能改了什么、为什么、怎么验证；
- `skill-config-matrix.md`：301 个技能 + 14 个组件的状态；
- `records.json`：最后审计的上游 SHA，`verify` 会与 lock 比对；
- `verification-log.md`：检查命令与结果。

升级任何上游前必须先读该目录；改完 vendor 规则后必须同步更新，否则 `node scripts/verify.mjs` 会失败。
