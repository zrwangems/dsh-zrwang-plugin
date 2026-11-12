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
| `ppt-master`（hugohe3/ppt-master） | 用 `.env` 配置生图模型与 Key | 由插件设置页「模型服务 → 生图模型」统一配置，保存时生成 `~/.ppt-master/.env`；用户不再手填技能 `.env` |
| `nature-downloader`（yuan1z0825/nature-skills） | 默认读 `~/.dsh/zrwang-plugin-config/nature-downloader/school.json` | 学校信息固定为北航，随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`；插件启动时用 `LIT_DL_CONFIG_DIR` 指向该目录，技能直接读，不往 `~/.dsh` 复制 |
| `nature-academic-search` | 读 `mcp-server/config.toml` | 由设置页「Nature-skill 设置」写 PubMed / Crossref / arXiv 参数到该文件 |
| `nature-image2ppt` | 读 `config.yaml` 的 OCR Token | 由设置页「模型服务 → OCR 模型」写入 `config.yaml` |
| `zotero-cli`（54yyyu/zotero-mcp） | 支持官方 Web API / 本地 API 两种模式 | 只保留 Zotero 桌面版本地 API，不使用官方 Web API 凭据；插件不提供 Zotero API 设置项 |
| `ARS`（Imbad0202/academic-research-skills） | 整仓 `shared/`、`scripts/`，工具名面向 Claude Code，繁体中文输出 | 18 条 rewrite：`shared/`→`_shared/`、跨技能路径改 `../<技能>/`、`python3`→`python`、`AskUserQuestion`→`ask_user_question`、`WebSearch`→`web_search`、`WebFetch`→`web_fetch`、繁体→简体；`headerNote` 强制简体中文与 Agent Team 多角色；补 `_shared/`、脚本闭包；16 个 `/ars-*` 命令别名；`vendor/ars/descriptions.json` 覆盖描述；`runtimeRoot` 写 `_shared/dsh-runtime.md` |
| `Supervisor Skills`（HKUSTDial/Supervisor-Skills） | 上游技能名 `deep-research` 与 ARS 重名 | `renames` 落盘为 `supervisor-deep-research`，frontmatter 由 `vendor/skill-patches.json` 同步 |
| 专利技能（handsomestWei/patent-disclosure-skill） | 正文按仓库根路径 `skills/<子技能>/` 引用 | 13 条 rewrite 改成 `../<子技能>/`，保证每个子技能单独注入时路径仍成立 |
| 其余仓库 | 技能可单独运行 | 只做描述中文化与必要路径处理；如发现问题按上面的原则补适配并登记到本表 |

## 新增 / 升级技能检查清单

1. `SKILL.md` 的 `name` / `description` 可用，中文短说明与详情已生成。
2. 正文里的相对路径在「技能单独注入」时成立；需要时补 `extraDirs` / `sharedFiles` / `scriptClosure` / `rewrite`。
3. 上游专用工具名、命令名已换成 DSH 对应能力；多角色流程写明用 Agent Team。
4. 需要配置的项已改走插件设置页或随包固定配置，不要求用户改技能目录里的文件。
5. 上游许可已归档到 `vendor/licenses/<仓库>/`，并在 README「技能来源」标注协议。
6. 跑 `vendor --only=…`、`gen-catalog`、`gen-skill-details`、`verify`、`smoke-host`，通过后更新本文件。
