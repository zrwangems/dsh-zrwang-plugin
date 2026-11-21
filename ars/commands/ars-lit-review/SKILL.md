---
name: ars-lit-review
description: "ARS academic-paper `lit-review` mode — annotated bibliography in paper format（ARS 命令入口）"
disable-model-invocation: true
---
先加载并遵循 `academic-paper` 技能（SKILL.md 及其引用文件），把下面的模式说明与用户输入当作该技能参数；不要用命令摘要代替技能正文。

Trigger the `academic-paper` skill in `lit-review` mode. Produces an annotated bibliography rendered as a literature review section. Fidelity spectrum, medium oversight.

Stay in `academic-paper` `lit-review` mode and do not reopen the choice of workflow: if the papers or sources the request refers to are missing, ask the user for them or offer to search for them within this mode.

The skill's review-form note (#921) belongs to this mode and does not reopen that choice: show it and wait when the skill says to, and continue in `lit-review` mode if the author skips it.

Mode reference: `_shared/MODE_REGISTRY.md`（技能目录下） § academic-paper.
Skill entry: `academic-paper` 技能的 `SKILL.md`.

Resolve plugin resources from 技能资源目录, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
