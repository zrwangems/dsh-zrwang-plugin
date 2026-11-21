# dsh-zrwang-plugin（My DSH）

王湛然专属DSH插件：按项目、按 DSH 工作区控制「注入哪些技能」和「启用哪些组件」，把 21 个上游 GitHub 仓库的技能收进一个统一入口。


## 它解决什么

技能从 `<项目根>/.agents/skills/` 发现，一个项目装几十上百个技能会互相干扰、难以挑选。本插件把技能按「工程 / 科研 / 办公」三组组织成目录树，按项目与 DSH 工作区保存注入状态：

- 勾选即注入，取消即摘除；技能实体只存在插件包里，不在每个项目重复复制。
- 按项目保存「默认」注入态，按 DSH 工作区自动建立以工作区命名的模式，同工作区所有对话共享、改动自动保存；右键可基于此新建、重命名、删除。
- 329 个技能全部可用，默认不注入任何技能（门禁全关），用哪组开哪组；默认勾选集合为工程 64 个 + 飞书 4 个基础技能。
- 每个技能都能一键打开上游 GitHub 项目；中文短说明与详情在侧栏直接看。


## 功能

- **三级目录树**：工程技能组 230 个（MATLAB / Simulink / MathWorks其他 三类并列）、科研技能组 52 个、办公技能组 47 个（含飞书 Lark 28 个），共 **329 个技能**，全部来自 **21 个上游 GitHub 仓库**（见下方「技能来源」）。安装后默认只展开到一级目录（工程 / 科研 / 办公 / ARS 行），各组都收起着，按需展开；用户的展开/收起状态会被记住。
- **技能选择态（按项目 + DSH 工作区）**
  - 每个项目初始只有「默认」：基础注入态，所有门禁关闭，**注入数恒为 0**；只读，不因侧栏勾选而改变。
  - 在「默认」上做任何修改（勾技能、开分组、开 ARS）会自动建立（或复用）**当前 DSH 工作区**的模式，名字就用工作区名，自动保存。
  - 一个工作区只有一个模式，**同工作区的所有对话共享**；打开新对话或新建工作区本身不会新建模式。
  - 所有模式（含「默认」）右键菜单：**基于此新建 / 重命名 / 删除**；「默认」与项目级模式复制进工作区自动模式，工作区自动模式复制成项目级副本。工作区模式重命名后升级为项目级模式，同项目所有工作区可见。
- **逐层与批量**：目录行的「全选 / 全关」只作用于**直接下一层**（子技能勾选、子目录门禁），不会递归下钻；**一级目录（工程/科研/办公）的「全选」会同时打开本组门禁**，点一次就能真正开始注入。搜索过滤时「全选 / 全关」只处理当前看得见的直接子节点。目录复选框按“子树里有没有勾选技能”自下而上推导：空子树显示未勾选并置灰；最上层四个（工程/科研/办公/ARS）仍是注入开关，默认都不勾。
- **技能详情**：中文短说明一行、详情按 Markdown 渲染，含表格、列表、代码与链接；详情读不出来时提示打开 SKILL.md。
- **上游链接**：每个「项目根」（如 MATLAB、中国专利技能、ARS）右侧有 **↗**，在浏览器打开对应 GitHub 仓库；项目内部的子目录/技能不重复显示。
- **写操作护栏**：模型用 write/edit 改插件内 `skills/`、`ars/` 一律拒绝（含经项目目录联接写入），避免跑任务时改坏技能。
- **ARS 学术研究（独立功能区块）**：目录 `ars/`，不进 `skills/`、不计入 329 个技能；默认关闭，勾选后注入 5 个流水线技能并提供 16 个 `/ars-*` 命令；多角色流程会在执行前自动打开 DSH 的「智能体团队协作」。
- **MCP 组件（与 ARS 并列的两行）**：
  - **MathWorks组件**：随工程技能组自动开关，注册 `matlab-mcp`（插件自带 exe + 完整的 Simulink Agentic Toolkit 运行时，共 14 个 MATLAB/Simulink 工具）；工程组关掉即注销。
  - **Windows MCP组件**：手动勾选后注册 `windows-mcp`（桌面截图、快照、点击、窗口操作），取消即注销；用系统 PATH 里已安装的 `windows-mcp`（`uv tool install windows-mcp` 等），插件不自带运行时。
  - 两者走 DSH `ctx.mcpManager` 动态注册，不改 profile 补丁、不用重启；参数固定、无设置项（MATLAB MCP 用包内 exe + SATK 扩展文件，Windows MCP 用系统 PATH 里已安装的 `windows-mcp`）；组件行有「启动中 / 已启动（N 个工具）/ 启动失败」标识和「重启」按钮。组件是宿主全局的，多个会话按并集保持：只要还有一个会话需要就继续注册，最后一个需要它的会话关掉后才注销，切换会话不会把别人正在用的工具撤掉。详见 [docs/mcp-components.md](docs/mcp-components.md)。

## 安装

需要 DSH `0.2.2-rc.2` 或更高版本（插件声明 `engines.dsh >=0.2.2-rc.2`；MCP 组件依赖该版本起提供的 `ctx.mcpManager`）。右侧栏默认使用 `dsh-better-sidebar 0.32.1+`（作为插件依赖会自动安装并启用）；**没有它也能用**：插件会退回注册一个 DSH 原生右侧栏页签「My DSH」。使用 DSH 0.2.2 的团队能力时，低于 0.32.1 的 better-sidebar 读取不到新的团队投影结构，任务页会报错，请一并升级。

在 DSH 里打开「设置 → 插件 → 安装插件」，搜索并安装：

```text
dsh-zrwang-plugin
```

也可以直接用命令行安装到当前 profile：

```powershell
dsh plugin --profile <你的profile> add dsh-zrwang-plugin
```

安装后重启 DSH 并刷新页面，右侧栏（better-sidebar 的标签栏或 DSH 原生右侧栏）里会出现「My DSH」。**重启这一步不能省**，bundle、客户端和 MCP 能力都在启动时装配。

### 安装后还需要做什么

插件本体装好后，下面这些按需处理（不装也能用，只是对应技能/组件会置灰或缺失）：

| 步骤 | 是否必需 | 做什么 |
| --- | --- | --- |
| 选择系统 Python | 要用技能里的 Python 功能时 | 插件**不自带 Python、不安装任何东西**。到 设置 → 运行环境 → Python 解释器，从本机已装的解释器里下拉选一个（或选「自动选择」用第一个可用解释器）；缺的第三方包会列出来，需要你在该环境里自行补齐 |
| MATLAB 侧初始化 | 用 MathWorks 组件时必需 | 安装 MATLAB R2023a+，在 MATLAB 里执行一次：`addpath('<插件目录>/mathworks/simulink-agentic-toolkit'); satk_initialize(MCPServerPath='<插件目录>/mathworks/matlab-mcp-server-windows-x64.exe')`（会共享当前会话并校验），或把这三行写进 `startup.m`。MATLAB 没运行时 MathWorks 组件会连不上 |
| `windows-mcp` | 用 Windows MCP 组件时必需 | 系统里自行安装并放进 PATH，例如 `uv tool install windows-mcp`；插件不自带它的运行时 |
| `lark-cli` | 用飞书 Lark 技能时必需 | `npm i -g @larksuite/cli` 并 `lark-cli auth login`；缺了 28 个飞书技能会置灰 |
| 可选组件 | 可选 | `officecli`、`zotero-cli`（Zotero 桌面版本地 API）、draw.io 桌面版、Polyspace、`firecrawl-cli`（`npm i -g firecrawl-cli`，配 Firecrawl Key 后可抓需要 JS 的页面）；缺了对应技能置灰 |
| 设置页配置 | 可选 | 模型服务里的生图模型（URL/模型/API Key）只影响生图类技能；科研服务的检索凭据按需填。MCP 不需要任何配置 |

> 右侧栏优先用 `dsh-better-sidebar`；如果没有启用它，右侧栏的原生「+」菜单里会出现「My DSH」页签。

## 使用

1. 打开右侧栏「My DSH」，在搜索框里按技能名、类别或说明过滤。
2. 展开「工程技能组 / 科研技能组 / 办公技能组」，打开需要的一级目录。
3. 勾选技能，或点目录行的「全选 / 全关」批量处理直接下一层（一级目录的全选会同时打开本组门禁；搜索过滤时只处理可见项）。
4. 在侧栏底部切换选择态；右键模式可基于此新建、重命名或删除，工作区模式改名后升级为项目级。
5. 技能行「详情」展开中文说明，「打开」在右侧栏查看 SKILL.md，「↗」在浏览器打开上游项目。

「ARS」功能区块与三个技能组排在一起：默认不勾选，勾选后注入 5 个论文流水线技能，并提供 `/ars-plan`、`/ars-full`、`/ars-lit-review`、`/ars-reviewer`、`/ars-revision` 等 16 个命令。多角色命令会在执行前自动打开 DSH 的「智能体团队协作」并投递授权说明；只有在无法改动该开关时（例如在子会话里调用）才会提示手动开启。

## 设置

「设置 → 插件 → My DSH」按用途分栏（设置页本身固定中文，不提供语言切换）。插件自身的设置保存在 `~/.dsh/zrwang-plugin-config/settings.json`，运行态在同目录的 `state/` 下：

| 栏目 | 内容 |
| --- | --- |
| 模型服务 | 生图模型（URL / 模型 / API Key，按 OpenAI Images 兼容协议，不再分厂商）、OCR 模型（百度 PaddleOCR-VL Token，可选；不填时 `nature-image2ppt` 退回技能内置的离线文字检测，只量位置和字号、读不出文字） |
| 科研服务 | 可选检索（Pexels / Pixabay / OpenAlex / Firecrawl）、Nature 学术检索（PubMed / Crossref / Unpaywall 邮箱与 API Key；缓存/超时/条数已改为内部固定值，不再暴露）、Nature 文献下载凭据（Elsevier / Springer Nature / IEEE，对应主要出版社）；学校配置随包固定分发（`skills/research/nature-skills/nature-downloader/config/school.json`），无需填写；Nature 生图复用模型服务的生图模型，不再单独设置；改动自动保存 |
| 运行环境 | 顶部一个「检查运行环境」按钮，下面一行一项：Python 解释器（下拉选择）、officecli、zotero-cli、lark-cli、draw.io、Polyspace、MATLAB、MathWorks MCP（可用性＝MATLAB 是否已 shareMATLABSession）、Windows MCP（可用性＝PATH 里是否装了 windows-mcp）；全部自动保存 |

**所有设置项改动即自动保存**（保存后同一个 DSH 进程立即生效；注意 DSH 的 shell 工具会按变量名清洗 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 类变量，插件会生成 Python 启动钩子从配置文件补回密钥；Web 与 Desktop 是独立进程，每个运行中的实例都会监听共享的 `settings.json`，其他实例保存后约 0.3 秒内也会重新注入环境变量，不用重启）（文本框失焦、下拉选择即生效，页面没有「保存」按钮）；「运行环境」合并成一个区块：顶部「检查运行环境」按钮同时做系统 Python 检测/依赖校验、组件状态和 MCP 检查，下面按行显示各环境项状态。`settings.json` 里存有 API Key，插件在写入后和启动时都会把文件权限收紧到当前账户（Windows 用 `icacls` 去掉权限继承，其它平台 `chmod 600`），失败时保持原样。

保存的设置会同步写进宿主进程环境：生图配置用插件专用 `ZRWANG_IMAGE_*`，由 ppt-master 技能内的桥接映射成 `OPENAI_*`；Nature 学术检索、Unpaywall/Crossref 邮箱、Firecrawl 等分别注入 `NCBI_EMAIL` / `UNPAYWALL_EMAIL` / `CROSSREF_MAILTO` / `FIRECRAWL_API_KEY`。Nature 生图的 `OPENROUTER_*` / `SCHEMATIC_IMAGE_API_URL` 直接复用模型服务的生图 URL/模型/Key。**技能的默认参数直接写在技能代码里**（学术检索默认值、image2ppt 后端、nature-figure 后端），设置页没填过的项不会生成任何配置文件；只有你确实填了出版社凭据或 Unpaywall 邮箱时，才会写进 `skills/research/nature-skills/nature-downloader/config/` 下的 `credentials.json` / `settings.json`（已 `.gitignore`）。`school.json` 同目录随技能分发，通过 `LIT_DL_SCHOOL_FILE` 读取。**不再读取或写入任何上游 `.env` / 旧配置文件**。

## 系统 Python

插件检测本机已有的解释器并校验依赖，由用户选择一个：

- **检测来源**：PATH 上的 `python` / `python3`、Windows `py` 启动器、Conda 环境（`conda env list`）、常见安装目录（Python 官方安装、Anaconda/Miniconda）；打开设置页时自动检测（结果缓存在 `<配置目录>/state/python-candidates.json`，5 分钟内复用），点「检查运行环境」会强制重扫。
- **选择**：设置 → 运行环境 → Python 解释器，下拉选一个（或「自动选择」用第一个可用解释器）；选完立即自动保存，没有自定义路径输入框。
- **校验**：会读版本并逐个 import 技能需要的模块（PyYAML、jsonschema、ruamel.yaml、pypdf、defusedxml、openpyxl、requests、Pillow、python-pptx、python-docx、PyMuPDF、openai、playwright）。**缺什么只列出，不安装**，请在你选择的环境里自行补齐。
- **生效方式**：插件把 `python` / `python3` 指向所选解释器（`<配置目录>/state/bin` 下的 shim + `BASH_ENV`），`bash` 指向 Git Bash；没有可用解释器时不动系统 PATH，技能会提示未选择。
- 插件不再随包分发 `runtime/`，也不再维护依赖清单；从本仓库安装时同样走系统 Python。

## 技能来源

| 分组 | 技能数 | 说明 |
| --- | --- | --- |
| 工程技能组 | 230 | MATLAB / Simulink / MathWorks其他（Polyspace、示例与演示） |
| 科研技能组 | 52 | Nature、Zotero、NSFC、HKUST 导师、中国专利（9）、学术去 AI 味等 |
| 办公技能组 | 47 | OfficeCLI、PPT Master、HTML PPT、Archify、图表、公文、归藏 PPT、前端幻灯片，以及飞书 Lark 28 个（消息、通讯录、日历、文档、表格、审批、会议、任务等） |

中文短说明与详情由脚本从各技能 `SKILL.md` 的 description 生成，缓存留在过程目录，可重复生成。

各技能上游仓库与许可（感谢作者与维护者）：

- [MATLAB Agentic Toolkit](https://github.com/matlab/matlab-agentic-toolkit)——MathWorks BSD-2 变体
- [Simulink Agentic Toolkit](https://github.com/matlab/simulink-agentic-toolkit)——MathWorks BSD-2 变体
- [Polyspace Agentic Toolkit](https://github.com/mathworks/polyspace-agentic-toolkit)——MathWorks BSD-2 变体
- [MATLAB Agent Skills Playground](https://github.com/matlab/agent-skills-playground)——MathWorks BSD-2 变体
- [larksuite/cli（lark-cli Agent Skills）](https://github.com/larksuite/cli)——MIT（Lark Technologies）；收录 28 个飞书技能
- [Nature Skills](https://github.com/yuan1z0825/nature-skills)——Apache-2.0
- [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)——Apache-2.0
- [PPT Master](https://github.com/hugohe3/ppt-master)——MIT
- [HTML PPT Skill](https://github.com/lewislulu/html-ppt-skill)——MIT
- [Zotero MCP](https://github.com/54yyyu/zotero-mcp)——MIT
- [Archify](https://github.com/tt-a1i/archify)——MIT
- [Academic Humanizer](https://github.com/AIScientists-Dev/academic-humanizer)——MIT（基于 blader/humanizer 与 ARMS）
- [Lieflat Less AI Tone](https://github.com/larashero3-dotcom/lieflat-less-ai-tone)——CC BY-NC 4.0
- [NSFC Agent Skills](https://github.com/njzjz/nsfc-agent-skills)
- [Supervisor Skills](https://github.com/HKUSTDial/Supervisor-Skills)——CC BY-NC-SA 4.0
- [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts)——PolyForm Noncommercial 1.0.0
- [Writing DNA](https://github.com/larashero3-dotcom/writing-dna-skill)——PolyForm Noncommercial 1.0.0
- [Lieflat Gongwen](https://github.com/larashero3-dotcom/lieflat-gongwen)——PolyForm Noncommercial 1.0.0
- [Guizang PPT Skill](https://github.com/op7418/guizang-ppt-skill)——AGPL-3.0
- [Frontend Slides](https://github.com/zarazhangrui/frontend-slides)——MIT
- [Patent Disclosure Skill](https://github.com/handsomestWei/patent-disclosure-skill)——MIT

## 功能区块

ARS 用法见 [docs/ars-usage.md](docs/ars-usage.md)，技能按插件特性做的改造记录见 [SKILL-ADAPTATIONS.md](SKILL-ADAPTATIONS.md)。

- [Academic Research Skills（ARS）](https://github.com/Imbad0202/academic-research-skills)——CC BY-NC 4.0

## 开发

```powershell
node --check host\*.mjs            # 语法
node scripts/build-client.mjs      # 改了 client/ 必须重新构建
node scripts/verify.mjs            # 包/目录/中文/默认集合/客户端语法全检
node scripts/smoke-host.mjs        # 宿主冒烟（不装 DSH）
node scripts/smoke-routes.mjs      # 路由层回归（假 ctx + 假 workspaceRegistry）

npm run build && npm run verify && npm run smoke   # 对应快捷脚本
```

## 卸载

```powershell
dsh plugin --profile <你的profile> remove dsh-zrwang-plugin
```

卸载只会移除 profile 里的依赖与 bundle，不会自动摘掉项目里已经建立的技能联接。想删干净按这个顺序：

1. 先在侧栏里把已勾选的技能/分组关掉，让插件把 `<项目根>/.agents/skills/` 下的联接摘掉；
2. 再执行上面的 remove；
3. 需要连配置和运行态一起清掉时，把 `~/.dsh/zrwang-plugin-config/` 整个移到回收站（里面有 `settings.json`、技能密钥、选择态与事件日志）。

插件包本身（仓库目录）不会被卸载命令删除；项目里 `.agents/skills/` 这些目录如果空了，可以手动删掉。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
