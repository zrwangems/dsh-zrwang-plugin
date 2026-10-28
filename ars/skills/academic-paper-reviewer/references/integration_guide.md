> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Pipeline Usage Example

```
User: I want to write a paper about AI in higher education quality assurance, from research to submission

Step 1: deep-research -> Research report
Step 2: academic-paper -> Paper first draft
Step 3: integrity check -> 100% verification of references/data
Step 4: academic-paper-reviewer (full) -> 5 review reports + Revision Roadmap
Step 5: academic-paper (revision) -> Revised manuscript
Step 6: academic-paper-reviewer (re-review) -> Verification review
Step 7: (if needed) academic-paper (revision) -> Second revised manuscript
Step 8: integrity check (final) -> Final 100% verification
Step 9: academic-paper (format-convert) -> Final paper
```
