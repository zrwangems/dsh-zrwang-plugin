# 学术研究（ARS）

## 是什么

一条从「研究想法」到「可投稿论文」的学术写作流水线，由五个技能组成：

| 技能 | 干什么 |
| --- | --- |
| deep-research | 选题与文献：把模糊想法收敛成研究问题，做文献综述、事实核查、PRISMA 系统综述 |
| academic-paper | 写作：大纲、草稿、中英摘要、图表、引用格式、返修与逐条回复 |
| academic-paper-reviewer | 模拟审稿：五席评审 + 编辑决定 + 返修路线图（只评审不改稿） |
| academic-pipeline | 总编排：把上面几个串成十阶段全流程，逐阶段停下确认 |
| sr-screener | 文献筛选：按纳入排除标准双盲筛选，出 PRISMA 计数与 RIS 分组 |

自带引用核验与学术诚信检查（假引用、编造结果、方法论伪造等），在交稿前先帮你查一遍。

## 怎么用

**第一步：勾选。** 右侧栏勾选「学术研究（ARS）」，五个技能注入当前项目；取消就移除。

**第二步：直接说需求**，例如：

- 「引导我研究 XXX」——反问几轮，帮你想清楚问题
- 「帮我写一篇关于 XXX 的论文」
- 「帮我评审这篇论文」（随后提供稿件）
- 「我收到审稿意见了」——拆成返修计划
- 「把这批文献按我的标准筛一遍」

**或者用命令**（输入框敲 `/ars-` 会列出全部）：

| 命令 | 干什么 |
| --- | --- |
| `/ars-plan` | 一节一节商量着规划论文结构 |
| `/ars-full` | 从研究到定稿完整跑一遍 |
| `/ars-lit-review` | 单次生成文献综述 |
| `/ars-reviewer` | 评审一篇已有论文 |
| `/ars-revision` | 按审稿意见返修并逐条回复 |
| `/ars-revision-coach` | 把审稿意见拆成返修计划 |
| `/ars-outline` | 只出详细大纲与证据地图 |
| `/ars-abstract` | 生成中英双语摘要 |
| `/ars-citation-check` | 核对引用是否真实、格式是否规范 |
| `/ars-format-convert` | 转 LaTeX/DOCX/PDF 或换引用格式 |
| `/ars-disclosure` | 生成投稿用 AI 使用声明 |
| `/ars-rebuttal-audit` | 检查 rebuttal 是否漏答审稿意见 |
| `/ars-3w` | 按 WHY/HOW/WHAT 三向扫文献 |
| `/ars-mark-read` | 标记某条引用已人工读过 |
| `/ars-unmark-read` | 取消上面的标记 |
| `/ars-cache-invalidate` | 清缓存，下次重新取数据 |

**过程中**：每个阶段会停下等你确认；产出文件落在当前项目目录。

**关于 Agent Team**：评审团、完整流水线这类多角色流程会用 DSH 的 Agent Team 并行跑；没开 Agent Team 时对应命令会提示先开启。`/ars-plan` 这种单角色对话不受影响。

**关于 Python**：引用核验、PRISMA 计数这类校验脚本需要 Python。插件**不自带也不安装** Python，只检测本机解释器；到「设置 → 运行环境 → Python 解释器」点「重新检测系统 Python」并选一个（缺的包会列出，需自行补齐）。选定后所有技能的 `python`/`python3` 自动指向它；「运行环境 → 组件状态」可检查解释器与依赖。

## 上游版本与改动范围

这部分内容来自 [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) **v3.24.4**（提交 `00315df`），五个技能的正文、角色提示、参考文件、模板和命令步骤都是复制过来的，不是重写。插件只做这些适配：

- 把上游根目录的 `shared/` 和用到的 `scripts/` 放进每个技能，路径从 `shared/...` 改为 `_shared/...`；
- 跨技能引用改成 `../<技能名>/...`，五个技能一起勾选即可互相读取；
- 顶部注明输出简体中文、多角色流程用 DSH Agent Team；
- `/ars-*` 命令保留上游的模式说明和脚本步骤，去掉 Claude Code 的 Skill 工具写法与插件根占位符；
- `WebSearch`/`WebFetch`/`AskUserQuestion` 换成 DSH 的 `web_search`/`web_fetch`/`ask_user_question`。

逐文件对照结果、每个命令对应的技能/模式，以及没有搬过来的 Claude Code hooks，写在 [ars-alignment.md](ars-alignment.md)。同步与核对：`node scripts/vendor-skills.mjs --only=ars`、`npm run verify:ars`。
