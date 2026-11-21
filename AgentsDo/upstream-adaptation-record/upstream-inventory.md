# 上游版本与适配盘点

核对时间：2026-11-21（Asia/Shanghai）。SHA 取自 `vendor/upstreams.lock.json`，逐个与上游分支 HEAD 比对，19 个 GitHub 仓库全部一致。

| 项目 | 上游 | 当前 pin | 技能 | 适配方式 | 关键改动 |
| --- | --- | --- | --- | --- | --- |
| MATLAB Agentic Toolkit | `matlab/matlab-agentic-toolkit` | `863b2489e5ad` | 157 | rules + headerNotes | `AskUserQuestion`→`ask_user_question`；每个 SKILL.md 顶部说明 MATLAB MCP 为 existing 模式、Python 用插件运行时 |
| Simulink Agentic Toolkit | `matlab/simulink-agentic-toolkit` | `bdfaf9ac3787` | 50 | rules + headerNotes + 运行时 | 同上；`mathworks/simulink-agentic-toolkit/` 更新到 2026.11.c（tools 1.0.35），MATLAB MCP exe 更新到 v0.16.1 |
| Polyspace Agentic Toolkit | `mathworks/polyspace-agentic-toolkit` | `7d242a24c9f8` | 19 | headerNotes | setup 技能顶部说明 DSH 的 MCP 配置在 profile `cordis.patch.yml`，不要改 Claude/Cursor/Codex 配置；本机未装 Polyspace 时置灰 |
| MATLAB Agent Skills Playground | `matlab/agent-skills-playground` | `f93265a6477e` | 4 | headerNotes | MATLAB MCP existing 模式说明 |
| Nature Skills | `yuan1z0825/nature-skills` | `a65a8364b419` | 24 | rules + patches + headerNotes | 5 个技能顶部说明配置来源；`nature-downloader` 配置目录、`nature-image2ppt` ImageMagick 误判、`nature-academic-search` MCP 降级与配置读取；正文 `WebSearch`/`WebFetch`→`web_search`/`web_fetch` |
| OfficeCLI | `iOfficeAI/OfficeCLI` | `fecece3ee605` | 11 | 仅裁剪/中文化 | 不捆绑 CLI；技能正文只做描述中文化与必要裁剪 |
| PPT Master | `hugohe3/ppt-master` | `63a03673d5c3` | 1 | overrides + patches + headerNotes | 整文件覆盖删除 `.env` 查找/加载，生图配置只读插件注入；项目目录改 `<cwd>/.agents/ppt-master/projects`；删除 `.env.example`、`update_repo.py` |
| HTML PPT Skill | `lewislulu/html-ppt-skill` | `fd1629067909` | 1 | 仅裁剪/中文化 | 无源码改动 |
| Zotero CLI | `local` | `本地副本` | 1 | 本地副本 | 本地副本；不引入第二套 Zotero 凭据 |
| Academic Research Skills | `Imbad0202/academic-research-skills` | `00315dfea67c` | 5 | rules + overrides + aliases | `shared/`→`_shared/`、工具名/语言/路径机械适配；写作用域护栏；16 个 `/ars-*` 命令；缓存改到插件 state |
| Academic Humanizer | `AIScientists-Dev/academic-humanizer` | `94b88b23703b` | 1 | rules | `AskUserQuestion`→`ask_user_question` |
| Lieflat Less AI Tone | `larashero3-dotcom/lieflat-less-ai-tone` | `fe77df00a27c` | 1 | 仅裁剪/中文化 | 无源码改动 |
| NSFC Agent Skills | `njzjz/nsfc-agent-skills` | `ac06208c6aa1` | 4 | 仅裁剪/中文化 | 无源码改动 |
| Supervisor Skills | `HKUSTDial/Supervisor-Skills` | `4c718106bd5d` | 12 | renames + patch | `deep-research` 落盘改名 `supervisor-deep-research`，frontmatter 同步 |
| Lieflat Charts | `larashero3-dotcom/lieflat-charts` | `4b4e75bde11c` | 1 | 仅裁剪/中文化 | 无源码改动 |
| Writing DNA | `larashero3-dotcom/writing-dna-skill` | `1335568bfd11` | 1 | overrides | README/SKILL/references 中文化覆盖 |
| Lieflat Gongwen | `larashero3-dotcom/lieflat-gongwen` | `c17e885c5579` | 1 | 仅裁剪/中文化 | 无源码改动 |
| Guizang PPT Skill | `op7418/guizang-ppt-skill` | `93d21bf4a73a` | 1 | 仅裁剪/中文化 | 无源码改动 |
| Frontend Slides | `zarazhangrui/frontend-slides` | `9906a34d640d` | 1 | 仅裁剪/中文化 | 无源码改动 |
| Patent Skills | `handsomestWei/patent-disclosure-skill` | `91e3b43a3e6b` | 9 | overrides + rewrites + headerNotes | 9 个子技能只认 `PATENT_*` 环境变量，删除 `~/Documents`、`~/.patent-disclosure-skill`、项目 `.agents/patent` 回退与 embedding 配置读写；整仓路径改 `../<子技能>/`；数据目录必填 |
| Archify | `local` | `本地副本` | 1 | 本地副本 | 固定 v3.2.0；注入 `ARCHIFY_UPDATE_CHECK_DISABLED=1` |
| 飞书 Lark | `local` | `本地副本` | 28 | 本地副本 + headerNotes | 28 个技能；说明 DSH 工具、`lark-cli` 登录、跨技能引用与 harness 对照表仅参考 |

合计：329 个技能树技能 + 5 个 ARS 流水线技能 = 334。

所有仓库共同执行的裁剪：`vendor/removals.json` 删除 tests/CI、包锁、CHANGELOG、`.github`、`.gitignore` 等不参与运行的 102 个文件/目录；`vendor-skills.mjs` 额外排除 `.git`、`node_modules`、`__pycache__` 等。

验证：`node scripts/audit-upstreams.mjs` 逐仓库对比上游文件清单（缺技能 0、缺文件 0）；`npm run verify`、`npm run smoke`、`node scripts/smoke-routes.mjs`、`node scripts/audit-skill-config.mjs --check` 全过。
