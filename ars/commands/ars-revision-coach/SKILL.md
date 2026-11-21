---
name: ars-revision-coach
description: "ARS academic-paper `revision-coach` — peer-review roadmap or source-accounted research-ethics-review response skeleton（ARS 命令入口）"
disable-model-invocation: true
---
先加载并遵循 `academic-paper` 技能（SKILL.md 及其引用文件），把下面的模式说明与用户输入当作该技能参数；不要用命令摘要代替技能正文。

Trigger the `academic-paper` skill in `revision-coach` mode. Ordinary reviewer comments produce a Revision Roadmap plus Response Letter skeleton without writing the revision. If the user says, or the pasted text shows, that the comments may come from a research ethics or human-subjects protection review (for example, from a research ethics committee or an institutional review board (IRB)), load the protocol of the #668 committee-correspondence variant (`committee_correspondence_protocol.md`). The Activation gate in `committee_correspondence_protocol.md` decides which comments this variant covers and what to quote from the user before taking it; comments that the gate excludes take normal `revision-coach` (#907). On the variant, preserve the UTF-8 source, emit the separate concern tracker and placeholder response skeleton, and run its deterministic completeness checker. Never infer committee authority from tone, and never emit priority, severity, determination, or Schema 11 on that branch. Runs on the inherited session model — the v3.7.0 `opus` frontmatter floor was retired in the 2026-06 harness pass so a stronger session model is never silently downgraded.

Mode reference: `_shared/MODE_REGISTRY.md`（技能目录下） § academic-paper.
Skill entry: `academic-paper` 技能的 `SKILL.md`.

Resolve plugin resources from 技能资源目录, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
