# nature-skills 配置面清单（逐技能审计）

本文件回答一个问题：**nature-skills 的每个配置项在哪里配置、插件是否已经提供**。

扫描范围：`skills/research/nature-skills/` 下 24 个技能的全部源码、配置、脚本和文档（97 个 `.py`、22 个 `.mjs`、R/Shell、YAML/TOML/JSON、SKILL.md）。扫描记录在
`AgentsDo/upstream-adaptation-record/.tmp/nature-config-audit/`（`audit.json` / `audit.md` / `skill-config-lines.json`）。

## 结论

科研服务现在包含 3 张卡：

1. **可选检索服务**：Pexels、Pixabay、OpenAlex、Firecrawl；
2. **Nature 学术检索**：PubMed 邮箱/API Key、Unpaywall 邮箱、缓存 TTL、Crossref 邮箱/超时、arXiv 超时、默认/最大返回条数；
3. **Nature 文献下载凭据**：Elsevier API Key / InstToken / AuthToken、Springer Nature Full Text/OA/Metadata Key、IEEE API Key / Full Text Endpoint。

学校图书馆访问固定为北航，`school.json` 直接随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`，通过 `LIT_DL_SCHOOL_FILE` 读取，不复制到插件配置目录；不提供设置。Nature 生图复用模型服务的生图 URL/模型/Key，不单独设置。

生成/注入位置：

```text
~/.dsh/zrwang-plugin-config/
├─ nature-academic-search/config.toml       PubMed / Crossref / arXiv / general
├─ nature-image2ppt/config.yaml             OCR + 通用生图
├─ nature-figure.json                       绘图后端偏好
└─ nature-downloader/
   ├─ credentials.json                      Elsevier / Springer Nature / IEEE
   └─ settings.json                         Unpaywall / Crossref 联系邮箱

skills/research/nature-skills/nature-downloader/config/school.json
                                            北航固定学校配置（随技能分发，LIT_DL_SCHOOL_FILE）
```

对应环境变量：`NCBI_EMAIL`、`NCBI_API_KEY`、`UNPAYWALL_EMAIL`、`CROSSREF_MAILTO`、`OPENALEX_API_KEY`、`FIRECRAWL_API_KEY`、`PEXELS_API_KEY`、`PIXABAY_API_KEY`、`OPENROUTER_API_KEY`、`OPENROUTER_IMAGE_MODEL`、`SCHEMATIC_IMAGE_API_URL`、`LIT_DL_CONFIG_DIR`、`LIT_DL_SCHOOL_FILE`、`ZRWANG_NATURE_ACADEMIC_CONFIG`、`IMAGE2PPT_CONFIG_HOME`、`NATURE_FIGURE_CONFIG`。Nature 生图的三个 OpenRouter/Images 变量由模型服务生图 URL/模型/Key 派生。

## 逐技能

| 技能 | 源码中的配置面 | 插件处置 |
| --- | --- | --- |
| nature-academic-search | `config.toml` 的 `[pubmed]`/`[crossref]`/`[arxiv]`/`[general]`；`PUBMED_EMAIL`、`NCBI_API_KEY`；`OPENALEX_API_KEY`；MCP 的 Scopus/ScienceDirect 复用 `pybliometrics` 配置 | 前四项写入 `config.toml` 并注入环境；OpenAlex Key 在「可选检索服务」；MCP 未注册，降级为 OpenAlex CLI + web 工具；`pybliometrics` 仅可选，见下 |
| nature-citation | `--mailto`（Crossref）、`--ncbi-email`（NCBI）、可选 `FIRECRAWL_API_KEY` | 已打补丁让两个参数默认读 `CROSSREF_MAILTO`/`NCBI_EMAIL`；Firecrawl Key 由「可选检索服务」注入 |
| nature-downloader | `school.json`（学校/认证/代理/数据库/发现入口，技能自带的 `config/school.json`）；`credentials.json`（Elsevier `api_key`/`insttoken`/`authtoken`，Springer `metadata_api_key`/`openaccess_api_key`/`fulltext_api_key`/`api_key`，IEEE `api_key`/`fulltext_endpoint`）；`settings.json.open_access.contact_email`；`UNPAYWALL_EMAIL` | 学校固定北航，直接随技能 `config/school.json`（`LIT_DL_SCHOOL_FILE`）；出版社凭据在「Nature 文献下载凭据」；`UNPAYWALL_EMAIL` 由学术检索的 Unpaywall 邮箱注入 |
| nature-figure | `NATURE_FIGURE_CONFIG` 的 `backend`；`OPENROUTER_API_KEY`、`OPENROUTER_IMAGE_MODEL`、`SCHEMATIC_IMAGE_API_URL`、可选 `OPENROUTER_SITE_URL`/`OPENROUTER_APP_NAME` | 后端偏好仍写 `NATURE_FIGURE_CONFIG`；OpenRouter/生图变量由模型服务的生图 URL/模型/Key 派生，不单独设置；`OPENROUTER_SITE_URL`/`APP_NAME` 用代码默认 |
| nature-image2ppt | `IMAGE2PPT_CONFIG_HOME/config.yaml`：`PADDLE_OCR_TOKEN`、`IMAGE2PPT_IMAGE_BACKEND`、`OPENAI_BASE_URL`、`IMAGE2PPT_IMAGE_MODEL`、`OPENAI_API_KEY`、可选 `IMAGE2PPT_IMAGE_USER_AGENT`/`IMAGE2PPT_CLI_PROG`；另支持 Codex OAuth 回退 | OCR 在「模型服务 → OCR 模型」，生图复用「模型服务 → 生图模型」；`USER_AGENT` 用默认，Codex 回退不使用 |
| nature-paper-to-patent | `EPUB_WAF_MAX_WAIT_SEC`、`PLAYWRIGHT_HEADED`、`EPUB_RESULT_HTML` | 调试/爬虫可选项，有默认值，不放进设置页；需要时用环境变量覆盖 |
| nature-ref-verifier | 可选 `pyzotero` Web 模式需要 userID + API key；本地 Zotero HTTP API 只读 | 插件已有 `zotero-cli` 本地模式；`pyzotero` Web 是可选替代，不放进设置页 |
| nature-experiment-log | 飞书群 ID / bot 权限由 `feishu-cli-integration` 提供 | 走 lark/feishu CLI，不是 nature 专属密钥；不放进 nature 设置 |
| nature-literature-pipeline | 关键词、投递目标、归档路径等任务级配置 | 每个任务在正文里配置，不是全局密钥；不放进设置页 |
| nature-paper-trans | 不直接调用生图 API；由执行模型/平台生成页面图 | 无需 API 配置 |
| nature-paper2ppt | 无 API 密钥；使用 PPTX/渲染工具 | 无需配置 |
| nature-paper2word | 无 API 密钥；YAML 是稿件级配置 | 无需全局配置 |
| nature-data | 无 API 密钥 | 无需配置 |
| nature-paper-card | 无 API 密钥 | 无需配置 |
| nature-paper-xray | 无 API 密钥 | 无需配置 |
| nature-polishing | 无 API 密钥 | 无需配置 |
| nature-proposal-writer | 研究域配置（正文/模板） | 任务级配置，不是密钥 |
| nature-reader | 无 API 密钥 | 无需配置 |
| nature-response | 无 API 密钥 | 无需配置 |
| nature-reviewer | 无 API 密钥 | 无需配置 |
| nature-shared | 无 API 密钥 | 无需配置 |
| nature-social-science | 无 API 密钥 | 无需配置 |
| nature-statistics | 无 API 密钥 | 无需配置 |
| nature-writing | 无 API 密钥 | 无需配置 |

## 明确没有放进设置页的项

以下都是**可选/调试/替代通道**，不是主流程必需，避免把设置页做成环境变量大全：

- **Elsevier `pybliometrics.cfg`**：只用于未注册的 academic-search MCP 的 Scopus/ScienceDirect provider。当前插件明确降级为 OpenAlex CLI + `web_search`/`web_fetch`，所以不生成这个文件；Elsevier Key 仍然保存在 `credentials.json`，供 `nature-downloader` 使用。
- **`pyzotero` Web userID/API key**：`nature-ref-verifier` 的可选 Zotero 写入通道；插件已有 `zotero-cli` 本地模式，暂不引入第二套 Zotero 凭据。
- **Feishu bot/group**：`nature-experiment-log` 通过 `feishu-cli-integration` 使用，不属于 nature 配置。
- **`OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME`**：只影响 OpenRouter 请求头，代码有默认值。
- **`IMAGE2PPT_IMAGE_USER_AGENT` / `IMAGE2PPT_CLI_PROG`**：可选调试项，有默认值。
- **`EPUB_WAF_MAX_WAIT_SEC` / `PLAYWRIGHT_HEADED` / `EPUB_RESULT_HTML`**：CNIPA 爬虫调试项，有默认值。
- **`CODEX_AUTH_FILE` / `CODEX_IMAGES_BASE_URL`**：`nature-image2ppt` 的 Codex OAuth 回退通道；本插件固定使用 OpenAI Images 兼容 API，不需要。

## 本轮补上的遗漏

之前科研服务只有「可选检索」和「Nature 学术检索（4 组字段）」，确实漏了：

1. `nature-downloader` 的 Elsevier / Springer Nature / IEEE 出版社凭据；
2. `nature-downloader` / `nature-citation` 的 Unpaywall、Crossref、NCBI 联系邮箱；
3. `nature-citation` 的可选 Firecrawl Key；
4. `nature-citation` 的 `--mailto` / `--ncbi-email` 默认值（已通过 vendor patch 接入环境变量）。

学校配置已改为**固定北航、随包分发**，不再放进设置页；Nature 生图已改为**复用模型服务**，也不再单独设置。静态回归见 `verification-log.md`。
