# dsh-zrwang-plugin（My DSH）

王湛然的个人 DSH 插件：把想要的能力装进一个入口，按项目、按 DSH 工作区决定这次注入哪些技能、启用哪些功能区块。当前版本 **0.1.1**。

这不是一个通用的「技能管理插件」，而是个人自用的一套 DSH 扩展。插件里有两类**互相独立**的成分：

| 成分 | 是什么 | 位置 | 数量 |
| --- | --- | --- | --- |
| **技能** | 从上游开源仓库同步来的技能实体，按工程 / 科研 / 办公成树，勾选即注入 | `skills/` | 301 个 |
| **功能区块** | 独立于技能树的能力包（目前是 ARS 学术研究），有自己的目录、命令、门禁和许可 | `ars/` | 1 个区块 |

技能解决「这次任务需要哪些专业能力」，功能区块解决「某个完整工作流要不要接进来」——两者的目录、数量统计、许可与文档都分开维护。

## 为什么做

DSH 的技能来自 `.agents/skills/`，一个项目装几十上百个技能会互相干扰、难以挑选；而很多好用的 AI 生态项目原本只面向 Claude Code / Codex，DSH 里没有现成入口。这个插件把「挑技能」和「接功能」都收进右侧栏，让个人 Harness 按项目、按工作区保持干净。

## 架构

- 浏览器侧只有「My DSH」页签；所有状态与实体都在宿主进程和本地磁盘。
- 宿主进程负责目录、勾选、选择态、注入编排、写操作护栏、ARS 命令与设置。
- `skills/`（技能实体）、`ars/`（功能区块）、`state/`（运行态）与配置目录分离；技能实体由 vendor 流水线生成，可随时重建。

## 技能（第一部分）

- **三级目录树**：工程技能组 230 个、科研技能组 52 个、办公技能组 19 个，共 **301 个技能**，来自 **18 个上游 GitHub 仓库 + 2 个本地副本**。
- **技能选择态（按项目 + DSH 工作区）**
  - 每个项目初始只有「默认」：基础注入态，所有门禁关闭，**注入数恒为 0**；只读，不因侧栏勾选而改变。
  - 在「默认」上做任何修改（勾技能、开分组、开功能区块）会自动建立（或复用）**当前 DSH 工作区**的模式，名字就用工作区名，自动保存。
  - 一个工作区只有一个模式，**同工作区的所有对话共享**；打开新对话或新建工作区本身不会新建模式。
  - 所有模式（含「默认」）右键都有 **基于此新建 / 重命名 / 删除**：「默认」和项目级模式复制进工作区自动模式，工作区自动模式复制成项目级副本；工作区模式重命名后升级为项目级。
- **逐层与批量**：目录行的「全选 / 全关」只作用于**直接下一层**（子技能勾选、子目录门禁），不会递归下钻。目录复选框按“子树里有没有勾选技能”自下而上推导：空子树显示未勾选并置灰；最上层四个（工程 / 科研 / 办公 / ARS）仍是注入开关，默认都不勾。
- **技能详情**：中文短说明一行、详情按 Markdown 渲染，含表格、列表、代码与链接；详情读不出来时提示打开 SKILL.md。
- **上游链接**：每个「项目根」（如 MATLAB、中国专利技能）右侧有 **↗**，在浏览器打开对应 GitHub 仓库；项目内部的子目录/技能不重复显示。
- **写操作护栏**：模型用 write/edit 改插件内 `skills/`、`ars/` 一律拒绝（含经项目目录联接写入），避免跑任务时改坏技能。

## 功能区块（第二部分）

功能区块不占技能树、不计入 301 个技能，单独放在包根，默认关闭，需要时在侧栏打开。

### ARS 学术研究

- 独立目录 `ars/`（不放在 `skills/` 下）：5 个论文流水线技能 + 16 个 `/ars-*` 命令，自己的运行时说明与依赖探测。
- 侧栏里是独立的「ARS」门禁行，与三个技能组并列，默认不勾选；勾选后注入整套流水线。
- 多角色流程（`/ars-full`、`/ars-reviewer`、`/ars-lit-review` 等）要求会话开启 DSH 的 **Agent Team**，未开启时会提示先开启。
- 用法见 [docs/ars-usage.md](docs/ars-usage.md)；许可 **CC BY-NC 4.0**，与技能来源分开（见下文）。

## 安装

需要 DSH `0.2.2-rc.1` 或更高版本（插件声明 `engines.dsh >=0.2.2-rc.1`），右侧栏依赖 `dsh-better-sidebar 0.30.1+`。

在 DSH 里打开「设置 → 插件 → 安装插件」，搜索并安装：

```text
dsh-zrwang-plugin
```

也可以直接用命令行安装到指定 profile：

```powershell
dsh plugin --profile <你的profile> add dsh-zrwang-plugin
```

安装后重启 DSH 并刷新页面，右侧栏的 `+` 里会出现「My DSH」。

> 右侧栏依赖 `dsh-better-sidebar`；没有的话先安装它。

## 使用

1. 打开右侧栏「My DSH」，在搜索框里按技能名、类别或说明过滤。
2. 展开「工程技能组 / 科研技能组 / 办公技能组」，打开需要的一级目录。
3. 勾选技能，或点目录行的「全选 / 全关」批量处理直接下一层。
4. 在侧栏底部切换选择态；右键模式可基于此新建、重命名或删除，工作区模式改名后升级为项目级。
5. 技能行「详情」展开中文说明，「打开」在右侧栏查看 SKILL.md，「↗」在浏览器打开上游项目。
6. 需要学术研究流水线时，单独勾选「ARS」行。

## 设置

「设置 → 插件 → My DSH」按用途分栏：

| 栏目 | 内容 |
| --- | --- |
| ARS 设置 | Python 解释器、Python 依赖检查（PyYAML、jsonschema、pypdf 等） |
| 模型服务 | 生图模型（ppt-master）、OCR 模型 |
| Nature-skill 设置 | PubMed / Crossref / arXiv 检索参数 |

保存的检索与模型配置会同步写入宿主进程环境，技能脚本执行时直接读取，不需要在项目里重复配置。

## 技能来源

| 分组 | 技能数 | 说明 |
| --- | --- | --- |
| 工程技能组 | 230 | MATLAB / Simulink / Polyspace / 示例 |
| 科研技能组 | 52 | Nature、Zotero、NSFC、HKUST 导师、中国专利（9）、学术去 AI 味等 |
| 办公技能组 | 19 | OfficeCLI、PPT Master、HTML PPT、Archify、图表、公文、归藏 PPT、前端幻灯片等 |

中文短说明与详情由脚本从各技能 `SKILL.md` 的 description 生成（Google 翻译，已是中文的保持原文），缓存留在过程目录，可重复生成。

技能上游按仓库列出（**许可逐个标注**，感谢作者与维护者）：

- [MATLAB Agentic Toolkit](https://github.com/matlab/matlab-agentic-toolkit)——MathWorks BSD-2 变体（第 3 条：仅限配合 MathWorks 产品使用）
- [Simulink Agentic Toolkit](https://github.com/matlab/simulink-agentic-toolkit)——MathWorks BSD-2 变体（同上）
- [Polyspace Agentic Toolkit](https://github.com/mathworks/polyspace-agentic-toolkit)——MathWorks BSD-2 变体（同上）
- [MATLAB Agent Skills Playground](https://github.com/matlab/agent-skills-playground)——MathWorks BSD-2 变体（同上）
- [Nature Skills](https://github.com/yuan1z0825/nature-skills)——Apache-2.0
- [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)——Apache-2.0
- [PPT Master](https://github.com/hugohe3/ppt-master)——MIT
- [HTML PPT Skill](https://github.com/lewislulu/html-ppt-skill)——MIT
- [Zotero MCP](https://github.com/54yyyu/zotero-mcp)——MIT（`zotero-cli` 为本地副本）
- [Archify](https://github.com/tt-a1i/archify)——MIT（本地副本，v3.2.0）
- [Academic Humanizer](https://github.com/AIScientists-Dev/academic-humanizer)——MIT（基于 blader/humanizer 与 ARMS）
- [Lieflat Less AI Tone](https://github.com/larashero3-dotcom/lieflat-less-ai-tone)——CC BY-NC 4.0
- [NSFC Agent Skills](https://github.com/njzjz/nsfc-agent-skills)——**无 LICENSE**（上游保留所有权利，仅本地使用）
- [Supervisor Skills](https://github.com/HKUSTDial/Supervisor-Skills)——CC BY-NC-SA 4.0
- [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts)——PolyForm Noncommercial 1.0.0
- [Writing DNA](https://github.com/larashero3-dotcom/writing-dna-skill)——PolyForm Noncommercial 1.0.0
- [Lieflat Gongwen](https://github.com/larashero3-dotcom/lieflat-gongwen)——PolyForm Noncommercial 1.0.0
- [Guizang PPT Skill](https://github.com/op7418/guizang-ppt-skill)——AGPL-3.0
- [Frontend Slides](https://github.com/zarazhangrui/frontend-slides)——MIT
- [Patent Disclosure Skill](https://github.com/handsomestWei/patent-disclosure-skill)——MIT

## 功能区块来源

- [Academic Research Skills（ARS）](https://github.com/Imbad0202/academic-research-skills)——CC BY-NC 4.0。作为独立功能区块接入（`ars/`），不计入技能来源与技能数。

## 完整性与许可

- 上游完整性：`node scripts/audit-upstreams.mjs --proxy=http://127.0.0.1:7897` 按 `vendor/upstreams.lock.json` 的 SHA 重新下载并逐技能核对文件清单；当前 **18 个 GitHub 仓库 + 2 个本地副本 / 301 技能**全部通过。
- 技能许可按仓库保留在 `vendor/licenses/<仓库>/`，逐仓库协议见上面「技能来源」；限制性许可（NoNCommercial、AGPL、无 LICENSE、MathWorks 使用范围）只允许随本包本地使用，公开再分发前需逐个确认。
- ARS 的许可（CC BY-NC 4.0）单独记录在 `vendor/licenses/ars/`，与技能来源分开。
- 插件代码为 MIT（见 `LICENSE`）。

## 开发

```powershell
node --check host\*.mjs            # 语法
node scripts/build-client.mjs      # 改了 client/ 必须重新构建
node scripts/verify.mjs            # 包/目录/中文/默认集合/客户端语法全检
node scripts/smoke-host.mjs        # 宿主冒烟（不装 DSH）
node scripts/smoke-routes.mjs      # 路由层回归（假 ctx + 假 workspaceRegistry）
```

架构与实现细节见 [docs/architecture.md](docs/architecture.md)，选择态 v3 与排障记录见 [docs/presets-v3.md](docs/presets-v3.md)，ARS 用法见 [docs/ars-usage.md](docs/ars-usage.md)。

## 卸载

```powershell
dsh plugin --profile <你的profile> remove dsh-zrwang-plugin
```

项目里的技能链接会随取消勾选自动移除；插件包本身不会被删除。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
