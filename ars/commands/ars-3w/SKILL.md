---
name: ars-3w
description: "ARS deep-research `three-way-scan` mode — WHY / HOW / WHAT paper comparison（ARS 命令入口）"
disable-model-invocation: true
---
先加载并遵循 `deep-research` 技能（SKILL.md 及其引用文件），把下面的模式说明与用户输入当作该技能参数；不要用命令摘要代替技能正文。

Trigger the `deep-research` skill in `three-way-scan` mode. Produces a compact paper shortlist compared by WHY / HOW / WHAT plus a cross-paper synthesis (common WHY, divergent HOW, strongest WHAT, unresolved gap). Lighter than `lit-review`; escalate to `lit-review` / `systematic-review` for full coverage. Fidelity spectrum, low oversight.

Mode reference: `_shared/MODE_REGISTRY.md`（技能目录下） § deep-research.
Skill entry: `deep-research` 技能的 `SKILL.md`.

Resolve plugin resources from 技能资源目录, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
