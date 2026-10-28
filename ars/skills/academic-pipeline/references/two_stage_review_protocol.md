> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Two-Stage Review Protocol (Added in v2.0)

## Stage 3: First Review (Full Review)

- **Input**: Paper that passed integrity check
- **Review team**: Journal-Fit Reviewer + R1 (methodology) + R2 (domain) + R3 (interdisciplinary) + Devil's Advocate
- **Output**: 5 review reports + Editorial Decision + Revision Roadmap + Socratic Revision Coaching
- **Decision branches**: Accept -> Stage 4.5 / Minor|Major -> Revision Coaching -> Stage 4 / Reject -> Stage 2 or end

See `../academic-paper-reviewer/SKILL.md` for review process details.

## Stage 3 -> 4 Transition: Revision Coaching

The Journal-Fit Reviewer uses Socratic dialogue to guide the user in understanding review comments and planning revision strategy (max 8 rounds). User can say "just fix it for me" to skip; when the user's answer already says how to revise, coaching is offered rather than started.

## Stage 3': Second Review (Verification Review)

- **Input**: Revised draft + hard-required original (pre-revision) draft (#576 current 1.1 §3.1 Phase 2A comparison base; absence is `manifest_incomplete`, because the required bundle already carries these bytes) + Response to Reviewers + original Revision Roadmap + exact author-adjudication sidecar + fully replayed Revision-Evidence Bundle + Editorial Decision Letter (#539 — its Review Panel Provenance block feeds the Judge Record) + Round-1 review findings (Schema 6 reports — #576 §4 level-3 criterion layer) + the exact ordered apply report/patch pairs projected by the bundle (#390/#576 §11) + Round-1 Reviewer Configuration Cards (yardstick continuity — field_analyst NOT re-run; `../academic-paper-reviewer/references/re_review_mode_protocol.md` § Yardstick Continuity). This input set describes re-review mode, the default Stage 3' (dispatched under the #576 three-gate contract; legacy single-pass only behind `ARS_RE_REVIEW_LEGACY=1`); a user-requested fresh full review at 3' instead (mid-entry quick→full path) takes the revised draft + available context only and runs full mode, field_analyst included
- **Mode**: `academic-paper-reviewer` re-review mode (default); the user-requested fresh full review at 3' dispatches full mode instead
- **Output**: re-review mode — Revision response comparison table + new issues list + new Editorial Decision + R&R Traceability Matrix (Schema 11); fresh full review — the normal full-review package (5 review reports + Editorial Decision + Revision Roadmap), no R&R matrix
- **Decision branches**: Accept|Minor -> Stage 4.5 / Major -> Residual Coaching -> Stage 4' (a Major driven only by items the author declined may instead take a limitations-only Stage 4' without coaching; `../agents/pipeline_orchestrator_agent.md` § Declined Items at Stage 3' and Stage 4' (#927))

See `../academic-paper-reviewer/SKILL.md` Re-Review Mode for verification review process.

## Stage 3' -> 4' Transition: Residual Coaching

The Journal-Fit Reviewer guides the user in understanding residual issues and making trade-offs (max 5 rounds). User can say "just fix it" to skip.
