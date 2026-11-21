# 上游改动台账

本台账记录 `dsh-zrwang-plugin` 对每个上游技能仓库做的**全部结构性改动**。`skills/` 下的文件由 `scripts/vendor-skills.mjs` 重建，手工改动会被覆盖；因此任何改动都必须落到 `vendor/upstreams.json`、`vendor/skill-patches.json` 或 `vendor/local/`，并在这里登记。

升级上游前先读本文件与 `README.md`；升级后同步更新「最后核对」列与 `records.json`。

最后核对：2026-11-21（19 个 GitHub 上游全部对齐到分支 HEAD；Simulink 运行时 2026.11.c / MATLAB MCP v0.16.1）。

## 一、vendor 规则级改动

| ID | 仓库/技能 | 文件/范围 | 类型 | 改动 | 原因 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| VEN-01 | `ars`（5 技能） | 全仓库 | rewrite | 18 条：`shared/`→`_shared/`、跨技能路径、`python3 `→`python `、`AskUserQuestion`→`ask_user_question`、`WebSearch`→`web_search`、`WebFetch`→`web_fetch`、繁体→简体 | DSH 技能资源根是技能目录本身，且工具名不同 | `vendor --only=ars --locked` + `verify` |
| VEN-02 | `ars` | `shared/`、`MODE_REGISTRY.md`、`docs/ARCHITECTURE.md`、`scripts/` | extraDirs / sharedFiles / scriptClosure | 把仓库根共享目录与脚本闭包并进每个技能 | 单独注入后 `_shared/`、`scripts/` 仍可读 | `audit-upstreams` 通过 |
| VEN-03 | `ars` | `SKILL.md`、`agents/*.md`、`references/*.md` | headerNote | 强制简体中文；多角色必须用 Agent Team | 上游面向 Claude Code 且默认繁体 | 抽查正文 |
| VEN-04 | `ars` | `commands/` | aliases | 16 个 `/ars-*` 命令别名 | 侧栏 ARS 门禁与斜杠命令 | `catalog/ars.json` 命令数 16 |
| VEN-05 | `ars` | 描述 | descriptions + runtimeRoot | `vendor/ars/descriptions.json` 覆盖描述；`_shared/dsh-runtime.md` | 上游描述过长、运行时说明需随 Python 设置变化 | `gen-catalog` / 设置页 ARS 卡 |
| VEN-06 | `supervisor` | `deep-research` | renames + skill-patches | 落盘目录与 frontmatter 改 `supervisor-deep-research` | 与 ARS 的 `deep-research` 重名 | `verify` 技能数/重名 |
| VEN-07 | `patent`（9 技能） | 正文 | rewrite | 13 条 `skills/<子技能>/`→`../<子技能>/`，并换 DSH 工具名 | 子技能独立注入后整仓路径不成立 | `verify` + 抽查 |
| VEN-08 | `nature`（24 技能） | 技能目录 | 仅描述中文化与必要路径 | 无结构性改写 | 上游可单独运行 | `audit-upstreams` |
| VEN-09 | `archify` | `vendor/local/archify` | local-copy | 固定 v3.2.0 本地副本 | 上游以 release 包分发、仓库根无 SKILL.md | `verify` |
| VEN-10 | `zotero` | `vendor/local/zotero-cli` | local-copy | 本地副本 | 上游仓库无 `skills/` 目录 | `verify` |
| VEN-11 | `ppt-master` | `SKILL.md`、`references/image-generator.md`、`scripts/docs/image.md` | headerNotes | 说明生图配置来自插件注入、上游 `.env` 已在 config.py 禁用；项目输出到 `<项目根>/.agents/ppt-master/projects` | 上游默认配置入口与项目目录与插件约定不同 | `image_gen.py --list-backends` 显示 process environment |
| VEN-12 | `nature` | `nature-image2ppt`、`nature-academic-search`、`nature-downloader`、`nature-figure` 的 `SKILL.md` | headerNotes | 分别说明 config.yaml 由插件写、MCP 未注册需降级、学校配置固定北航随包、绘图偏好用 `NATURE_FIGURE_CONFIG` | 避免模型去检查 C 盘配置或调用不存在的 MCP | `image2ppt doctor` / `preflight.py` |
| VEN-13 | `polyspace` | `polyspace-agentic-toolkit-setup/SKILL.md` | headerNotes | DSH 的 MCP 配置在 profile `cordis.patch.yml`，不要改 Claude/Cursor/Codex；未装 Polyspace 直接报告不可用 | 上游 setup 技能面向别的 agent，会改外部配置 | 抽查正文；侧栏置灰 |
| VEN-14 | `patent` | 9 个 `SKILL.md` | headerNotes | 数据都在设置页「专利数据目录」下的 `vault/`、`patent-map/`、`oa/`、`outputs/`，不写 `~/Documents`、`~/.patent-disclosure-skill` 或工作区 `.agents/patent/` | 数据目录由用户指定，未设置时不注入 | 抽查 `oa_home`/`map_home` |
| VEN-15 | `matlab-agentic` / `simulink` / `playground` | 全部 `SKILL.md` | headerNotes | MATLAB MCP 是 existing 模式，需先启动 MATLAB 并 `shareMATLABSession()` | 当前 MATLAB 未运行时 MCP 报 failed to attach | 会话中调用 MCP 工具时可见 |
| VEN-16 | `nature-downloader` | `src/config.py` 等 5 文件 | patch | 配置目录从 `~/.config/lit-dl` 改到 DSH 家目录（旧规则保留） | 避免 C 盘用户目录 | `LIT_DL_CONFIG_DIR` |
| VEN-17 | `matlab-agentic` / `simulink` | `matlab-call-python`、`matlab-import-external-ai-model`、`simulink-integrate-python-code` 的 `SKILL.md` | headerNotes | 说明 Python 统一用插件运行时，MATLAB `pyenv` 用 `ZRWANG_SKILL_PYTHON` | 用户要求所有技能 Python 由插件提供 | 抽查正文 |
| VEN-18 | `nature` | `nature-downloader`、`nature-figure`、`nature-academic-search`、`nature-citation` 的 `SKILL.md` | headerNotes | 说明配置在插件配置目录；下载器凭据、学术邮箱/Firecrawl 由设置注入；学校固定北航；Nature 生图复用模型服务 | 配置集中和不兼容旧 `.env` 的要求 | 顶部说明 + `npm run verify` |
| VEN-19 | `lark`（28 技能） | 每个 `SKILL.md` | headerNotes | 说明用 DSH `read`/`write`/`edit` 与 `pwsh`/`bash` 执行 `lark-cli`、需先 `lark-cli auth login`、Claude/Codex harness 对照表仅参考、`../lark-shared` 等跨技能引用需一起勾选 | lark-cli 官方 skills 面向多 harness；DSH 无法解析其他 harness 的工具与配置 | `vendor --only=lark` + `verify` |
| PAT-13 | `nature-citation` | `scripts/nature_citation.py` | patch | `--mailto` / `--ncbi-email` 默认读 `CROSSREF_MAILTO` / `NCBI_EMAIL`；补 `import os` | 设置里的邮箱不用每次手动传参 | `--help` 显示默认；`npm run verify` |

## 二、文件补丁（`vendor/skill-patches.json`）

| ID | 仓库/技能 | 文件 | 类型 | 改动 | 原因 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| PAT-01 | `supervisor-deep-research` | `SKILL.md` | patch | `name: deep-research` → `name: supervisor-deep-research` | 与 ARS 重名 | `verify` |
| PAT-02 | `nature-downloader` | `src/config.py`、`scripts/configure_credentials.py`、`scripts/lib/{credentials,school-config,settings}.mjs` | patch | 配置目录改 `~/.dsh/zrwang-plugin-config/nature-downloader` | 原默认在 `~/.config/lit-dl` | 启动时 `LIT_DL_CONFIG_DIR` 指向包内 config |
| PAT-04 | `ppt-master` | `scripts/project_management/paths.py`、`cli.py` | patch | `PROJECTS_ROOT` 改技能目录 `projects/`，`default_projects_root()` 优先用它 | 插件把 `projects/` 联接到 `<项目根>/.agents/ppt-master/projects` | `project_manager.py init demo` |
| PAT-05 | `nature-image2ppt` | `cli/image2ppt/runtime/runtime_env.py`、`formula_renderer.py` | patch | `convert` 探测排除 `C:\Windows\System32\convert.exe` | Windows 自带 `convert.exe` 被误判为 ImageMagick | `image2ppt doctor` 显示 optional/missing |
| PAT-06 | `nature-academic-search` | `static/core/tools.md` | patch | 顶部加“DSH 未注册 MCP，改用 web 工具 + OpenAlex CLI”说明 | 上游主路径依赖未注册的 MCP | 抽查正文；`preflight.py` |
| PAT-07 | `patent-oa` | `tools/config.py` | override | 只认 `PATENT_OA_HOME`（专利数据目录下的 `oa/`），删除项目 `.agents/patent`、`~/Documents`、`~/.patent-disclosure-skill` 回退与 embedding 配置文件读写 | 数据目录必须由用户在设置页指定 | `oa_home()` 未设置时直接报错 |
| PAT-08 | `patent-map` | `tools/map_cache.py` | override | 只认 `PATENT_MAP_HOME` | 默认写 `~/Documents` | `map_home()` 未设置时报错 |
| PAT-09 | `patent-map` | `tools/vault_index.py` | override | Obsidian 库只用 `PATENT_READER_OBSIDIAN_VAULT` | 默认写 C 盘主目录 | `vault_root()` 读环境变量 |
| PAT-10 | `patent-reader` | `tools/shared/obsidian_env.py` | override | 库路径只读 `PATENT_READER_OBSIDIAN_VAULT`，删除 `~/.patent-disclosure-skill` 持久化与项目回退 | 默认写 C 盘主目录 | `persisted_vault_config_path()` 返回 None |
| PAT-12 | `nature-academic-search` | `mcp-server/utils/config.py` | patch | 配置路径优先读 `ZRWANG_NATURE_ACADEMIC_CONFIG` | 配置集中到插件配置目录，不再写技能目录 | `Config()` 读插件配置目录的 `config.toml` |

## 三、运行时文件（由插件设置生成，不属于上游源码改动）

| ID | 文件 | 写入方 | 内容 | 说明 |
| --- | --- | --- | --- | --- |
| RUN-01 | `skills/research/nature-skills/nature-academic-search/mcp-server/config.toml` | `host/skill-settings.mjs` | PubMed/Crossref/arXiv 参数 | 已 gitignore；vendor 时保留 |
| RUN-02 | `skills/research/nature-skills/nature-image2ppt/config.yaml` | `host/skill-settings.mjs` | OCR Token + 通用生图 URL/模型/Key | 已 gitignore；vendor 时保留 |
| RUN-03 | ~~`~/.ppt-master/.env`~~ | — | — | 已取消：不兼容上游 `.env`，不写 C 盘 | 插件独立性要求 |
| RUN-04 | `~/.dsh/zrwang-plugin-config/nature-figure.json` | `host/skill-settings.mjs` | `{backend: "python"}` | 避免首次写 `~/.config/nature-skills` |
| RUN-05 | `skills/research/nature-skills/nature-downloader/config/school.json` | `LIT_DL_SCHOOL_FILE` | 北航学校配置 | 直接随技能分发；`LIT_DL_CONFIG_DIR` 只放 credentials/settings |
| RUN-06 | `<state>/python/sitecustomize.py` | `host/skill-settings.mjs` 的 `applyPythonSecretBridge` | 让技能用的 Python 进程从 `settings.json` 补回被 DSH shell 凭据清洗删掉的 `*_API_KEY` 等变量 | 密钥不经过 shell 环境；PPT 生图另有文件兜底 |
| RUN-06 | `skills/office/ppt-master/projects` | `host/farm.mjs` | 目录联接 → `<项目根>/.agents/ppt-master/projects` | 仅勾选 ppt-master 时存在 |
| RUN-07 | `state/bin/{python,python3,bash,sh}.cmd`、`state/bin/bash-env.sh` | `host/ars.mjs` | 插件 Python / Git Bash shim 与 `BASH_ENV` | 无用户开关，始终指向 `runtime/python` |
| RUN-08 | ~~`~/.dsh/zrwang-plugin-config/patent/`~~ | — | — | 已取消：专利数据目录必须在设置页指定，不再兜底 |
| RUN-09 | ~~`~/.dsh/zrwang-plugin-config/nature-academic-search/config.toml`~~ | — | — | 已取消：PubMed/Crossref 参数由插件环境变量直接注入 |
| RUN-10 | ~~`~/.dsh/zrwang-plugin-config/nature-image2ppt/config.yaml`~~ | — | — | 已取消：OCR/生图参数由插件环境变量直接注入 |
| RUN-11 | ~~`~/.dsh/zrwang-plugin-config/nature-downloader/{credentials,settings}.json`~~ | — | — | 已取消：凭据在 DSH 凭据库，其余配置在 profile `config` |
| RUN-12 | `skills/research/nature-skills/nature-downloader/config/school.json` | `LIT_DL_SCHOOL_FILE` | 学校访问配置 | 北航固定，随技能目录；不复制到插件配置目录 |

## 四、本轮新增改动

| ID | 仓库/技能 | 文件 | 类型 | 改动 | 原因 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| NEW-11 | `ppt-master` | `scripts/{image_gen,config,image_search,notes_to_audio}.py`、`scripts/README.md` | override | 用整文件覆盖替代已失效的 PAT-03/PAT-11 补丁：删除 `.env` 查找与加载，生图配置只读插件注入的 `ZRWANG_IMAGE_*`（密钥走 `ZRWANG_IMAGE_CRED`），项目目录改 `<cwd>/.agents/ppt-master/projects` | 上游删掉了 `ENV_PATH`/`.env` 桩点，字面补丁不再适用；整文件覆盖可重复重放 | `image_gen.py --list-backends` 显示 process environment |
| NEW-12 | MATLAB / Simulink / Nature / academic-humanizer | 各 `SKILL.md` 与引用文档 | rewrite | 正文里的 `AskUserQuestion`→`ask_user_question`，Nature 的 `WebSearch`/`WebFetch`→`web_search`/`web_fetch` | DSH 没有这些 Claude 工具名，保留会让模型调用不存在的工具 | `grep` 复查；`npm run verify` |
| NEW-13 | ARS | `host/env.mjs` | runtime-config | 注入 `ARS_VERIFICATION_CACHE_PATH=<state>/ars/verification.db` | 上游引用校验缓存默认写 `~/.cache/ars`，不落到用户主目录 | `configEnv()` 含该变量；`smoke` |
| NEW-14 | MathWorks | `mathworks/simulink-agentic-toolkit/`、`mathworks/matlab-mcp-server-windows-x64.exe` | runtime-bin | Simulink 运行时更新到 2026.11.c（tools 1.0.35），MATLAB MCP 更新到 v0.16.1；9 个扩展工具名不变 | 跟上游最新 release 对齐 | `VERSION`/`tools/VERSION`；`tools.json` 9 个工具 |
| NEW-01 | 运行时 | `host/ars.mjs`、`host/skill-settings.mjs` | runtime-config | python/python3/bash shim；`BASH_ENV` 注入函数；不 shim rm/chmod | WindowsApps python3 空壳、WSL bash 空壳 | `python3 -c "import pptx"`；`bash -lc 'python3 -V'` |
| NEW-02 | 设置 | `host/skill-settings.mjs`、`client/settings.mjs`、`host/plugin-params.mjs`、`host/routes.mjs` | runtime-config | 通用生图 URL/模型/Key，去掉厂商选择；v1→v2 迁移；检查动作 | 上游厂商后端写死模型/地址，换网关不可用 | 设置页 `image-check` 显示 openai/process environment |
| NEW-03 | 记录机制 | `scripts/verify.mjs`、`records.json` | doc-note | 上游 SHA 与审计记录不一致即失败；`audit-skill-config --check` 纳入 verify | 升级时必须看记录 | 人为改 SHA 触发失败 |
| NEW-04 | vendor | `scripts/vendor-skills.mjs` | runtime-config | `--locked` 按 lock SHA 检出；`--proxy` 用 curl；`headerNotes` 数组；CRLF 归一化补丁 | 避免顺带升级、代理下载、整树换行 diff | `vendor --only=… --locked --proxy=…` |
| NEW-05 | ppt-master / nature / patent / polyspace / MATLAB | `vendor/upstreams.json` | headerNotes | 见 VEN-11~VEN-15 | 避免模型检查 C 盘配置或调用不存在的 MCP | 抽查 SKILL.md |
| NEW-06 | ppt-master / nature-image2ppt / patent | `vendor/skill-patches.json` | patch | 见 PAT-03~PAT-10 | 生图注入、项目目录、ImageMagick、MCP 降级、专利目录 | 见各行验证 |
| NEW-07 | 全技能 | `scripts/audit-skill-config.mjs`、`vendor/skill-config-rules.json` | runtime-config | 329 技能 + 16 组件逐项审计，生成矩阵 | “一个都不能漏”的可复核机制 | `audit-skill-config --check` |
| NEW-08 | 运行时 | `runtime/python/`、`scripts/install-python-runtime.mjs`、`vendor/python-requirements.txt` | runtime-config | 插件自带 standalone CPython 3.11 + venv + 集中依赖；所有技能 Python 由它提供 | 用户要求插件独立 Python，不向系统开放，不在 skill 目录放 py 包 | `npm run verify` + `npm run smoke`；`runtime\python\venv\Scripts\python.exe --version` |
| NEW-09 | 设置页 | `host/skill-settings.mjs`、`client/settings.mjs`、`host/plugin-params.mjs`、`host/routes.mjs` | runtime-config | 分栏改为模型服务/科研服务/运行环境；科研服务自动保存且无检查/保存按钮；删除 Python 与依赖卡 | 用户要求 | 正常 dsh web 打开设置页目视检查 |
| NEW-10 | 配置集中 | `host/skill-settings.mjs`、`vendor/skill-patches.json` | runtime-config | nature 配置、北航学校配置、image2ppt 配置全部写 `~/.dsh/zrwang-plugin-config/`；ppt-master 禁用 `.env`；生图复用模型服务 | 用户要求不兼容上游旧配置、保证独立性 | `image2ppt doctor`；`image_gen --list-backends`；配置文件列表 |
