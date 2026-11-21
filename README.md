# dsh-zrwang-plugin（My DSH）

王湛然专属DSH插件：按对话控制「注入哪些技能」和「启用哪些组件」，把 22 个上游 GitHub 仓库的技能收进一个统一入口。


## 它解决什么

DSH 默认从 `<项目根>/.agents/skills/` 发现技能，一个项目装几十上百个技能会互相干扰、难以挑选。本插件把技能按「工程 / 科研 / 办公」三组组织成目录树，并按对话保存注入状态。它不再往项目里建目录联接，而是通过 DSH 官方的 `ctx.skills` 提供方按对话直接提供选中的技能：

- 勾选即注入，取消即摘除；技能实体只存在插件包里，项目目录里不出现 `.agents/skills`，也不留链接。
- 每个对话有自己的选择快照，改动只影响当前对话；新对话首次打开时继承当前选择，之后互不干扰。模式仍按项目/工作区管理，用来快速套用一组常用选择。
- 329 个技能全部可用，默认不注入任何技能（门禁全关），用哪组开哪组；默认勾选集合为工程 64 个 + 飞书 4 个基础技能。
- 每个技能都能一键打开上游 GitHub 项目；中文短说明与详情在侧栏直接看。


## 功能

- **三级目录树**：工程技能组 230 个（MATLAB / Simulink / MathWorks其他 三类并列）、科研技能组 52 个、办公技能组 47 个（含飞书 Lark 28 个），共 **329 个技能**，全部来自 **22 个上游 GitHub 仓库**（见下方「技能来源」）。安装后默认只展开到一级目录（工程 / 科研 / 办公 / ARS 行），各组都收起着，按需展开；用户的展开/收起状态会被记住。
- **技能选择态（按对话）**
  - 每个对话第一次打开侧栏时，用当时的全局选择初始化自己的快照；此后勾技能、开分组、开 ARS 都只写当前对话。
  - 切换回旧对话时，侧栏和技能提供方恢复该对话自己的选择，不会被别的对话改掉。
  - 模式是项目级的快捷模板，套用后会写进当前对话，不会反过来改别的对话。
  - 所有模式（含「默认」）右键菜单：**基于此新建 / 重命名 / 删除**；「默认」与项目级模式复制进工作区自动模式，工作区自动模式复制成项目级副本。工作区模式重命名后升级为项目级模式，同项目所有工作区可见。
- **逐层与批量**：目录行的「全选 / 全关」只作用于**直接下一层**（子技能勾选、子目录门禁），不会递归下钻；**一级目录（工程/科研/办公）的「全选」会同时打开本组门禁**，点一次就能真正开始注入。搜索过滤时「全选 / 全关」只处理当前看得见的直接子节点。目录复选框按“子树里有没有勾选技能”自下而上推导：空子树显示未勾选并置灰；最上层四个（工程/科研/办公/ARS）仍是注入开关，默认都不勾。
- **技能详情**：中文短说明一行、详情按 Markdown 渲染，含表格、列表、代码与链接；详情读不出来时提示打开 SKILL.md。
- **上游链接**：每个「项目根」（如 MATLAB、中国专利技能、ARS）右侧有 **↗**，在浏览器打开对应 GitHub 仓库；项目内部的子目录/技能不重复显示。
- **写操作护栏**：模型用 write/edit 改插件内 `skills/`、`ars/` 一律拒绝，避免跑任务时改坏技能。
- **ARS 学术研究（独立功能区块）**：目录 `ars/`，不进 `skills/`、不计入 329 个技能；默认关闭，勾选后注入 5 个流水线技能并提供 16 个 `/ars-*` 命令；多角色流程会在执行前自动打开 DSH 的「智能体团队协作」。
- **MCP 组件（与 ARS 并列的两行）**：
  - **MathWorks组件**：随工程技能组自动开关，注册 `matlab-mcp`（插件自带 exe + 完整的 Simulink Agentic Toolkit 运行时，共 14 个 MATLAB/Simulink 工具）；工程组关掉即注销。
  - **Windows MCP组件**：手动勾选后注册 `windows-mcp`（桌面截图、快照、点击、窗口操作），取消即注销；用系统 PATH 里已安装的 `windows-mcp`（`uv tool install windows-mcp` 等），插件不自带运行时。
  - 两者只在 Windows 上可用（MATLAB MCP 是 Windows 可执行文件，Windows MCP 依赖 Windows 桌面），其他平台显示不可用。两者走 DSH `ctx.mcpManager` 动态注册，不改 profile 补丁、不用重启；参数固定、无设置项（MATLAB MCP 用包内 exe + SATK 扩展文件，Windows MCP 用系统 PATH 里已安装的 `windows-mcp`）；组件行有「启动中 / 已启动（N 个工具）/ 启动失败」标识和「重启」按钮。
  - 组件选择按对话保存。两个服务器仍由 `ctx.mcpManager` 在宿主级启动/保持（多个会话取并集），但插件用官方的 `ctx.tools.restrict({ deny })` 在每个 agent 作用域把本对话没启用的 `mcp__*` 工具从工具列表、提示词上下文和执行里一起移除；不是等模型调用时才拒绝，而是这个对话根本看不到、也不会注入。别的对话勾了就在它自己的工具表里出现。详见 [docs/mcp-components.md](docs/mcp-components.md)。

## 安装

需要 DSH `0.2.2-rc.2` 或更高版本（插件声明 `engines.dsh >=0.2.2-rc.2`；MCP 组件依赖该版本起提供的 `ctx.mcpManager`）。右侧栏默认使用 `dsh-better-sidebar 0.30.x`（作为插件依赖会自动安装并启用）；**没有它也能用**：插件会退回注册一个 DSH 原生右侧栏页签「My DSH」。

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

「设置 → 插件 → My DSH」按用途分栏（设置页本身固定中文，不提供语言切换）。**所有能填的项都在这里**，没有第二个配置文件：

| 栏目 | 内容 |
| --- | --- |
| 模型服务 | 生图模型（URL / 模型 / API Key，按 OpenAI Images 兼容协议）、OCR 模型（百度 PaddleOCR-VL Token，可选） |
| 科研服务 | 可选检索（Pexels / Pixabay / OpenAlex / Firecrawl）、Nature 学术检索（PubMed / Crossref / Unpaywall 邮箱与 API Key）、Nature 文献下载凭据（Elsevier / Springer Nature / IEEE）、Nature 绘图后端（Python / R）、专利检索向量模型（智谱 / 通义 / OpenAI / 本地，可选）与 Obsidian 专利库路径 |
| 运行环境 | Python 解释器下拉选择，以及 officecli、zotero-cli、lark-cli、draw.io、Polyspace、MATLAB、MathWorks MCP、Windows MCP 的可用性 |

改动即生效：每张卡片下方有「保存」按钮；Nature 绘图、专利向量服务这类下拉选择选中即自动保存。保存后插件立即用新值重算环境变量，不需要重启 DSH。

### 配置放在哪里

- **非密钥配置**只写进当前 profile 的 `cordis.patch.yml`，即 `- id: dsh-zrwang-plugin` 这一项的 `config`。没有 `settings.json`，也没有插件自己的配置目录。
- **密钥**只写进 DSH 凭据库（`api-key` 凭据），不写 YAML、不写日志、不回显；设置页只显示「已设置 / 未设置」。因此插件包、profile 补丁和 `cache/` 里都不会出现明文密钥。
- **运行期产物**只有选择态、门禁、模式、事件和专利工作数据，放在插件安装目录下的 `cache/`（`cache/state/`、`cache/patent/`），卸载插件时一起删除；插件不会在 `~/.dsh` 里另建目录。
- Python 启动钩子和 `python`/`python3`/`bash`/`firecrawl` 转发脚本是随包分发的静态文件（`host/pysite/`、`host/shim/`），运行期不生成、不复制。
- 配置通过 DSH 官方 `ctx.shellEnv` 注册成每次 shell 调用的 `DSH_ZRWANG_*` 事实，不再手工改宿主进程环境。DSH 的 shell 会清掉名字里带 `KEY` / `TOKEN` / `SECRET` / `PASSWORD` 的普通环境变量，所以密钥用 `_CRED` 结尾的 `DSH_ZRWANG_*` 变量；`host/pysite/sitecustomize.py` 在 Python 启动时把它们映射回上游脚本认识的标准名字。
- 上游技能自己的配置文件、向导和读写代码已删除：技能只从插件注入的环境变量取参数。需要改默认值时改插件设置，不要去改技能目录。

## 系统 Python

插件检测本机已有的解释器并校验依赖，由用户选择一个：

- **检测来源**：PATH 上的 `python` / `python3`、Windows `py` 启动器、Conda 环境（`conda env list`）、常见安装目录（Python 官方安装、Anaconda/Miniconda）；打开设置页时自动检测（结果缓存在插件 `cache/state/python-candidates.json`，5 分钟内复用），点「检查运行环境」会强制重扫。
- **选择**：设置 → 运行环境 → Python 解释器，下拉选一个（或「自动选择」用第一个可用解释器）；选完立即自动保存，没有自定义路径输入框。
- **校验**：会读版本并逐个 import 技能需要的模块（PyYAML、jsonschema、ruamel.yaml、pypdf、defusedxml、openpyxl、requests、Pillow、python-pptx、python-docx、PyMuPDF、openai、playwright）。**缺什么只列出，不安装**，请在你选择的环境里自行补齐。
- **生效方式**：插件把静态的 `host/shim/python` 目录挂到 PATH 前面，`python` / `python3` 转给所选解释器；`host/shim/bash` 里的 `bash` / `sh` 转给 Git Bash 或系统 bash。没有可用解释器时不挂这个目录，技能会提示未选择。
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

卸载只会移除 profile 里的依赖与 bundle。技能是 DSH 运行时提供的，不在项目目录留文件，所以不需要先摘链接；配置随 profile 补丁删除，密钥随 DSH 凭据库删除，运行期状态在插件目录的 `cache/` 下，卸载插件时一起消失。

插件包本身（仓库目录）不会被卸载命令删除。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
