> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Screening protocol template and configuration reference

## Contents
1. `screening_protocol.md` skeleton
2. Boundary cases
3. `screening_config.json` fields

The protocol file is sent verbatim to every reviewer, so write it for a careful reader who knows
nothing about the project: complete sentences, examples, no internal shorthand. Keep it under
about 1,500 words; long protocols cost tokens on every batch and hide the important rules.

## 1. `screening_protocol.md` skeleton

```markdown
# Screening protocol: title/abstract stage
Version 1.0, confirmed by <name> on <date>. Source: <proposal / PROSPERO CRDxxxx>.

Review (<review type>): "<title>".
Question: <one sentence>.

## Eligibility (full protocol)
- Population: ...
- Intervention / index test / exposure: ...
- Comparator: ...
- Outcome / target condition: ...
- Design: ...
- Full-text-only criteria (<list>) must NOT be used to exclude at this title/abstract stage.

## "<fuzzy concept>" (interpret broadly at screening)
Counts: ...
Does not count on its own: ...
Exception, treat as unclear: ...

## Decisions
- "include" (code INC): <what must be clearly met on the title/abstract>.
- "unclear" (code UNC): plausibly eligible but the title/abstract is insufficient, for example:
  (a) ... (b) ... (c) no abstract, but the title suggests <core criteria>.
- "exclude": give ONE code, the first criterion that clearly fails, checked in this order:
  - E1 publication type: <list, e.g. reviews, editorials, letters, conference abstracts, protocols>.
  - E2 not human: animal studies, in vitro only.
  - E3 population: ...
  - E4 intervention / index test / exposure: ...
  - E5 comparator: ...
  - E6 outcome / target condition: ...
  - E9 other reason (explain).

## Principles
- Sensitive: missing an eligible study is worse than an extra full-text check; when in doubt, "unclear".
- Decisive: most records are clearly irrelevant; "unclear" only when <core criteria> are plausibly met.
- Judge content, not language. Use the publication type in the record header for E1.

## Amendment log
| Date | Change | Reason | Records to re-screen |
|------|--------|--------|----------------------|
```

Full-text protocol: copy the file, drop the "unclear" examples and the full-text-only list,
add the full-text-only criteria to the eligibility list, and state that "unclear" means
information missing from the report (awaiting classification). Keep the same codes and order
where possible so reasons stay comparable between stages; if the full-text codes differ, list
them in `ft_exclusion_codes`.

## 2. Boundary cases

Write 4-6 synthetic records that sit on the edges of the rules, with the expected decision,
and agree them with the user before the pilot:

```markdown
### Boundary case 3 (synthetic)
TI: Urinary NGAL and KIM-1 in infants after congenital heart surgery
AB: Infants (n=60) had urinary NGAL measured at 0, 2 and 6 h; AKI occurred in 18.
Expected: include (INC). Children after cardiac surgery, urinary NGAL, AKI as outcome.
Tests: whether "infants" is read as children.
```

A useful set: one clear include, one unclear (core criteria plausible, key detail missing), one
title-only record, one that fails the first code in the order, and one that fails a later code
while looking relevant.

## 3. `screening_config.json` fields

Template: `templates/screening_config.template.json`. Every field has a default except the ones
marked required.

| Field | Meaning | Default |
|-------|---------|---------|
| `review_title` | short title for logs | "" |
| `exclusion_codes` (required) | list of `{code, short, label}`; list order is the checking order; `code` like `E1`, never `INC`/`UNC` | generic E1-E6, E9 |
| `ft_exclusion_codes` | separate list for full text, if different | same as above |
| `core_criteria` | 2-3 short phrases; gate for "unclear" and the adjudicator's tie-break | population, intervention/index test |
| `personas.A`, `personas.B` | one sentence each: content expert, methodologist | generic |
| `conflict_policy` | `adjudicate` (third reviewer) or `liberal` (either advance is enough) | adjudicate |
| `qc.near_miss` | `{group: [regex, ...]}`; an exclusion matching every group is rechecked | {} |
| `qc.random_exclusion_sample` | records both reviewers excluded that the senior reviewer rechecks (required; minimum 20, all when fewer) | 100 |
| `qc.random_seed` | seed for that sample, so it is reproducible | 2026 |
| `qc.policy` | `advance` (QC advance wins) or `flag` (listed only) | advance |
| `seeds` | `[{label, doi, pmid, title}]` known eligible studies | [] |
| `languages_allowed` | languages that pass without a flag; others are flagged, not excluded | [] |
| `models` | per role: `A`, `B`, `ADJ`, `QC`, `FTA`, `FTB`, `FTADJ` (`sonnet`, `opus`, or "" for the session model; the cost check lists any override) | sonnet for every role |
| `model_labels` | exact model names for the methods text, per role | placeholders |
| `agent_type` | subagent that runs the reviewers, as listed in the agent registry (for example `academic-research-skills:screening_reviewer_agent` for a plugin install, `screening_reviewer_agent` for a skills-copy install); "" uses the default workflow subagent | "" |
| `batching.max_records` / `max_chars` / `wrap` | batch size limits and line wrap | 50 / 90000 / 150 |
| `dedup.doi_title_guard` | a shared DOI merges records only if titles are compatible | true |
| `read_limit`, `grep_after` | Read call size and Grep context lines | 900, 60 |

Regular expressions in `qc.near_miss` are Python syntax and case-insensitive; escape
backslashes in JSON (`"\\bNOA\\b"`).
