---
name: ars-full
description: "ARS full pipeline — research → write → review → revise → finalize（ARS 命令入口）"
disable-model-invocation: true
---
先加载并遵循 `academic-pipeline` 技能（SKILL.md 及其引用文件），把下面的模式说明与用户输入当作该技能参数；不要用命令摘要代替技能正文。

Trigger the `academic-pipeline` orchestrator (`(pipeline)` in `_shared/MODE_REGISTRY.md`（技能目录下） — the orchestrator has no named mode of its own). Loads the skill and executes the complete academic research workflow (10-stage orchestration: deep-research → academic-paper → integrity → academic-paper-reviewer → revision → re-review → final integrity → finalize).

Mode reference: `_shared/MODE_REGISTRY.md`（技能目录下） § academic-pipeline.
Skill entry: `academic-pipeline` 技能的 `SKILL.md`.

Resolve plugin resources from 技能资源目录, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
