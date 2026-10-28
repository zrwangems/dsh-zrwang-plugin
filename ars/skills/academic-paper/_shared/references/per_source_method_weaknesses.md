> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Per-Source Method Weaknesses (#916)

This file holds the canonical per-source method-weakness rules for ARS reading outputs. The block between the markers is copied verbatim into each surface below; `scripts/check_method_weaknesses_sync.py` keeps every copy byte-identical to this one.

| Surface | Where the block sits |
|---|---|
| `../deep-research/templates/evidence_assessment_template.md` | §4 Methodological Quality |
| `../deep-research/SKILL.md` | Three-Way Scan Mode, WHAT field |
| `../deep-research/agents/bibliography_agent.md` | Step 5 Annotated Bibliography |
| `../academic-paper/agents/literature_strategist_agent.md` | Annotated Bibliography |

Why the rules exist: a free-text "strengths and limitations" line gives no way to tell a weakness the authors stated from one the reader guessed, or a checked absence from an unchecked one. ScientistTwo (Nam et al., 2026, arXiv:2609.19644, Appendix C) shows the named-design-plus-failure-condition format; its items are unlabelled inferences with no locator, and it adds a research-direction field, so ARS takes the format and not those two parts.

Out of scope: Socratic mode, any improvement or research-direction field, skip or decline counters, and any gate, verdict, or score. The rules change what a reading output says about one source. They are not measured; no claim of improved review quality is made.

<!-- method-weaknesses:begin -->
**Method weaknesses (per source, #916).** Information only. Nothing here blocks, gates, scores, or asks the scholar a question.

1. **Named design and failure condition.** Name the specific design, measure, sample, or analysis choice, and the condition under which it would distort the result. "Small sample" alone is not enough; "n = 24 from one site, so the site effect cannot be separated from the treatment" is.
2. **Provenance label on every item.** Mark each item `author-acknowledged` or `reader-inferred`. An `author-acknowledged` item carries a locator in one of the v3.7.3 anchor kinds (`quote`, `page`, `section`, `paragraph`). A `reader-inferred` item is an untested inference and says so.
3. **Bounded absence claims.** A statement that the authors do not address X names the sections that were checked (the #548 search-bounded pattern). If those sections cannot be named, do not make the absence claim.
4. **Fixed aspect checklist.** Use the source's paper-type table in `../academic-paper-reviewer/references/review_criteria_framework.md` §2 (empirical, theoretical, review / meta-analysis, case study, policy). Mark each criterion in that table `checked: found`, `checked: none found`, or `not checked`. Stop at the end of the table; do not keep adding items until the list feels complete.
5. **No method-level weakness without the text.** When only the abstract or table of contents is available, or the recorded read scope (`/ars-mark-read --scope`) is `abstract_only`, `toc_only`, or `unknown`, write `not assessed (read scope: <scope>)` and no inferred weaknesses. For `sections`, stay within the declared sections.

Do not turn a weakness into an improvement suggestion or research direction; that step stays with the scholar. Keep the entry short:

```
- **Method weaknesses** (<paper type>; read: <what was read>)
  - checked: found: <criterion>, ... | checked: none found: <criterion>, ... | not checked: <criterion>, ...
  - <design choice>; distorts the result when <condition>. [author-acknowledged, <anchor kind>: <locator>] or [reader-inferred]
```

or, when rule 5 applies, `- **Method weaknesses**: not assessed (read scope: <scope>)`.
<!-- method-weaknesses:end -->
