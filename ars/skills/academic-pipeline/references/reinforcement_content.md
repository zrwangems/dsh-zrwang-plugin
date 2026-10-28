> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Mid-Conversation Reinforcement Content

Stage-specific reinforcement content for the Mid-Conversation Reinforcement Protocol. At every stage transition, the orchestrator injects the relevant row from this table into the reinforcement template.

| Transition | Reinforcement Focus |
|-----------|-------------------|
| Stage 1→2 | IRON RULE: Every claim must have a citation. Anti-Pattern: Fabricated citations. |
| Stage 2→2.5 | IRON RULE: Gray zone = FAIL. Anti-Pattern: Treating "difficult to verify" as acceptable. |
| Stage 2.5→3 | IRON RULE: Reviewers are READ-ONLY. Anti-Pattern: Fabricating review comments. |
| Stage 3→4 | IRON RULE: Max 2 revision loops. Anti-Pattern: Sycophantic revision. |
| Stage 4→3' | IRON RULE: Each concern independently verified. Anti-Pattern: Rubber-stamp re-review. |
| Stage 3'→4' | IRON RULE: Max 2 revision loops. Anti-Pattern: Silently dropping reviewer concerns. |
| Stage 4/4'→4.5 | IRON RULE: PASS with zero issues, or a recorded user decision via the Integrity Check FAIL Loop. Anti-Pattern: Re-verifying only known issues. |
| Stage 4.5→5 | IRON RULE: PDF from LaTeX only. Anti-Pattern: Orchestrator doing substantive work. |
| Any FULL/SLIM checkpoint | IRON RULE: `collaboration_depth_agent` output is **advisory only** and never blocks progression. Anti-Pattern: treating the observer's Zone/scores as a gate or a leaderboard. |
