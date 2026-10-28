> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Changelog

| Version | Date | Changes |
|---------|------|---------|
| Unreleased | 2026-08-15 | Contract-honesty hardening (#739/#740): categorical, criterion-bound review outputs; current live packages fixed at `NOT_CALIBRATED` until measured-profile application has a closed replay contract; typed six-axis panel provenance with exact machine handoff and no binary independence claim. No reviewer-correctness or outcome-improvement claim. |
| 1.4 | 2026-03-08 | Historical release that introduced a numerical rubric and fixed decision mapping (now retired). Current behavior uses criterion-bound narrative judgements; live packages remain `NOT_CALIBRATED`, and measured-profile application is not yet wired. Quick Mode Selection Guide retained. |
| 1.3 | 2026-03-05 | DA vs R3 role boundaries with explicit responsibility tables; CRITICAL finding criteria with concrete examples; Consensus classification (CONSENSUS-4/3/SPLIT/DA-CRITICAL); Confidence Score weighting rules; Asian & Regional Journals reference (TSSCI + Asia-Pacific + OA options) |
| 1.2 | 2026-03 | Added statistical reporting standards reference; enhanced methodology_reviewer_agent with statistical reporting adequacy sub-step |
| 1.1 | 2026-02 | Added Devil's Advocate Reviewer (7th agent), added re-review mode, expanded review team from 4 to 5 |
| 1.0 | 2026-02 | Initial version: 6 agents, 4 modes, 3-phase workflow |
