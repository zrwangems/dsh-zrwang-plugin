---
name: ars-reviewer
description: "ARS academic-paper-reviewer `full` mode — simulated peer-review panel（ARS 命令入口）"
disable-model-invocation: true
---
先加载并遵循 `academic-paper-reviewer` 技能（SKILL.md 及其引用文件），把下面的模式说明与用户输入当作该技能参数；不要用命令摘要代替技能正文。

Trigger the `academic-paper-reviewer` skill in `full` mode. Honor explicit alternate modes when present: `quick`, `methodology-focus`, `re-review`, `guided`, or `calibration`. Runs on the inherited session model — the v3.7.0 `opus` frontmatter floor was retired in the 2026-06 harness pass so a stronger session model is never silently downgraded.

Mode reference: `_shared/MODE_REGISTRY.md`（技能目录下） § academic-paper-reviewer.
Skill entry: `academic-paper-reviewer` 技能的 `SKILL.md`.

Resolve plugin resources from 技能资源目录, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
