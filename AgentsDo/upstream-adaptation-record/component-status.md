# 组件状态

本文件记录插件功能组件（不是 329 个技能）的配置接入状态。技能级状态见 `skill-config-matrix.md`。

| 组件 | 状态 | 依赖/配置 | 当前处置 | 验证 |
| --- | --- | --- | --- | --- |
| 设置页 + profile 补丁 `config` + DSH 凭据库 | 已接入设置 | 唯一可编辑配置源 | 模型服务（生图/OCR）、科研服务（可选检索、Nature 学术检索、Nature 文献下载凭据，全部自动保存）、运行环境（仅组件状态）；学校固定北航、Nature 生图复用模型服务；无 Python 设置卡、无旧 `.env` 兼容 | `GET/POST /settings`；`npm run verify` |
| 技能注入 / 目录联接（farm） | 已接入 | 项目根 `.agents/skills`；ppt-master `projects` 链接 | 按勾选建立联接；取消只摘链接 | `smoke-host` / `smoke-routes` |
| 系统 Python | 已接入 | 插件不自带、不安装；检测 PATH/py 启动器/Conda/常见目录，设置页选择并只读校验依赖 | python/python3 shim 指向所选解释器；bash 指向 Git Bash；缺包只提示 | 设置 → 运行环境 → Python 解释器；`npm run verify` + `npm run smoke` |
| ARS | 已接入 | 所选系统 Python + yaml/jsonschema/ruamel.yaml/pypdf/defusedxml/openpyxl；引用校验缓存写到 `<state>/ars/verification.db` | 依赖只校验不安装；跨模型验证为可选；不写 `~/.cache/ars` | `checkArsDeps`；`configEnv()` 的 `ARS_VERIFICATION_CACHE_PATH` |
| 飞书 Lark | 已接入 | 本机 npm 全局 `@larksuite/cli`（lark-cli 1.0.99）+ 已登录；28 个技能在 `skills/office/lark`，本地副本 `vendor/local/lark-skills` | 办公技能组新增「飞书 Lark」分类；四个基础技能（contact/event/im/shared）默认勾选，其余默认关闭；lark-cli 缺失时技能置灰并提示安装/登录；跨技能引用需一起勾选 | 设置 → 运行环境 显示 lark-cli；`lark-cli --version`；侧栏办公 → 飞书 Lark |
| officecli | 已接入 | 本机外部安装的 `officecli`（插件不捆绑；上游最新 1.0.163） | 缺命令时侧栏置灰 | `officecli --version` |
| zotero-cli | 已接入 | Zotero 桌面版本地 API；`ZOTERO_LOCAL=true` | Zotero 未运行/未开本地 API 时由技能如实提示 | `zotero-cli config` |
| MATLAB MCP | 已接入（插件动态注册） | 包内 `mathworks/`：`matlab-mcp-server-windows-x64.exe`（v0.16.1）+ `simulink-agentic-toolkit/`（2026.11.c，tools 1.0.35）；`ctx.mcpManager` 注册 `matlab-mcp`；参数固定（existing 模式 + 包内 tools.json），无设置项 | 工程技能组打开且确有注入时自动启用；组件行有启动标识与「重启」 | 侧栏组件行「已启动（14 个工具）」；`/health` 的 mcp |
| Windows MCP | 已接入（插件动态注册） | 系统 PATH 里的 `windows-mcp`（本机 uv tool 安装）；`ctx.mcpManager` 注册 `windows-mcp`；参数固定（`serve` + 两个 env），无设置项 | 手动勾选组件时启用；组件行有启动标识与「重启」 | 侧栏组件行「已启动（21 个工具）」；`/health` 的 mcp |
| Polyspace MCP | 不可用 | 需要 Polyspace 安装 + Polyspace MCP | 本机未安装；19 个技能置灰并给出原因 | `POLYSPACE_ROOT` / 安装检测 |
| draw.io | 不可用 | 需要 draw.io 桌面版 | 本机未安装；`drawio-reconstruction` 置灰 | `DRAWIO_PATH` / 安装检测 |
| ppt-master 运行时 | 已接入设置 | 通用生图 URL/模型/Key；所选系统 Python；项目目录 | `ZRWANG_IMAGE_*` 进程环境 + `image_gen.py` 桥接；`config.py` 禁用 `.env`；`paths.py`/`cli.py` 项目目录补丁 | `image_gen.py --list-backends` 显示 openai/process environment |
| nature 运行时 | 已接入设置 | 配置只有插件设置一个来源 | 非密钥在 profile 补丁 `config`，密钥在 DSH 凭据库；技能只读注入的环境变量；北航 `school.json` 随技能在 `skills/research/nature-skills/nature-downloader/config/school.json`（`LIT_DL_SCHOOL_FILE`）；`academic-search` MCP 降级 | `image2ppt doctor`；`preflight.py`；`generate_openrouter_schematic.py --dry-run` |
| Nature 生图 | 复用模型服务 | OpenAI Images 兼容网关 | 不单独设置；`OPENROUTER_API_KEY` / `OPENROUTER_IMAGE_MODEL` / `SCHEMATIC_IMAGE_API_URL` 由模型服务的生图 URL/模型/Key 派生 | `generate_openrouter_schematic.py --dry-run` |
| patent 运行时 | 已接入设置 | 设置页「专利数据目录」（必填，无默认值）；Obsidian/embedding 按需 | oa / patent-map / patent-reader 只认 `PATENT_OA_HOME` / `PATENT_MAP_HOME` / `PATENT_READER_OBSIDIAN_VAULT`，不再写项目 `.agents/patent` 或用户主目录；未填目录时 9 个专利技能置灰 | `oa_home()`/`map_home()`/`resolve_vault()` |
| archify 运行时 | 已接入 | 本地副本 v3.2.0 | 注入 `ARCHIFY_UPDATE_CHECK_DISABLED=1`，不写用户缓存配置 | 渲染自检 |
| Windows shell | 已接入 | 插件 shim + Git Bash | `python`/`python3`/`bash`/`sh` 统一 shim；Git Bash 内用 `BASH_ENV` 注入 python 函数；不 shim `rm`/`chmod` | `python --version`；`bash -lc 'python -V'` |
| DSH 端到端实测 | 待用户检查 | 正常 `dsh web`（web profile，3080） | 先供用户看设置页与运行环境；基本要求通过后才测试 | 用户确认 |

## 已知限制

- Polyspace、draw.io 本轮不自动安装；技能置灰，不静默失败。
- MATLAB MCP 由插件 MathWorks组件在工程技能组开启时动态注册（existing 模式），必须由用户先启动 MATLAB 并 `shareMATLABSession()`；插件不会自动拉起 MATLAB（想自动可把会话模式改成 `auto`）。服务器名是 `matlab-mcp`，工具前缀 `mcp__matlab-mcp__*`；若 profile 里还留着旧的静态 `mcp-matlab` 行要先删除，否则注册冲突。
- 两个 MCP 组件只在 Web/桌面端 profile 生效；headless/sdk profile 没有 `ctx.mcpManager`，组件行显示「当前 profile 不支持」。
- `nature-academic-search` 的完整多源 MCP 服务器未注册；降级为 OpenAlex CLI + `web_search`/`web_fetch`。Scopus/ScienceDirect 的 `pybliometrics` 配置因此不生成；Elsevier Key 仍写入下载器 `credentials.json`。
- `pyzotero` Web 模式需要 Zotero userID/API key，本插件继续用 `zotero-cli` 本地模式，不引入第二套 Zotero 凭据。
- Playwright Chromium 不再随插件安装；需要浏览器自动化的技能自行使用所选系统 Python 里已装的 Playwright 与浏览器缓存。
- 真实生图/OCR 接口未在验收中调用；只验证配置解析与后端选择，避免产生费用。
- ppt-master 的 `projects` 目录联接是全局的；多个项目并发时以最近一次同步为准，命令应优先传绝对路径。
