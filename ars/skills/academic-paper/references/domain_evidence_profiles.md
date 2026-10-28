> 输出语言（本 DSH 集成强制）：所有面向用户的文字、稿件、摘要、评审与报告一律使用**简体中文**；英文术语与引文保持英文。文中的 `zh-TW` / `zh-tw-en` 只是上游语言代码与脚本参数，不代表要用繁体输出。用户明确要求其他语言时以用户为准。
>
> 多角色执行（评审团、十阶段流水线、角色扮演）必须使用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话看不到这些工具，说明用户没开 Agent Team，必须先提示用户开启，不得退化成单会话顺序扮演。
# Domain Evidence Profiles

> **Advisory only.** A domain evidence profile changes which evidence types the literature screening *admits*. It never changes the A-F Overall Grade and never blocks manuscript ship. It never changes which databases are queried (that stays `Discipline`-driven in `literature_strategist_agent` Step 2). Consumed only by `academic-paper`'s `literature_strategist_agent`; produced by `intake_agent` Step 12 as the PCR `Domain Evidence Profile` row.

## Domain Evidence Profiles

The ship-ready enum is exactly four values. `unknown_user_defined` is the default and the neutral fallback.

| Profile | Standard evidence types | Common provenance requirements | Critical gaps to surface | Reserved-note |
|---|---|---|---|---|
| `general_social_science` | Peer-reviewed empirical studies, mixed-methods, expert-panel / context-dependent policy analyses | Journal or proceedings; expert-panel reports acceptable where context-dependent | Single-context generalization; weak external validity | — (ship-ready) |
| `cs_ml` | Peer-reviewed papers AND archival preprints (e.g. arXiv), conference proceedings; industry technical reports | Preprint server or proceedings acceptable; peer-review lags the field | Non-reproducible results; benchmark cherry-picking | — (ship-ready) |
| `humanities_interpretive` | Primary sources, archival material, canonical/older texts, monographs | Primary-source provenance; recency is not a quality signal | Interpretive over-reach; missing primary-source grounding | — (ship-ready) |
| `unknown_user_defined` | Neutral single-pyramid (pre-#259 behavior) — peer-reviewed default | Standard peer-review expectation | (no profile-specific loosening) | Default / neutral fallback |

**Reserved profiles (documented, NOT in the enum).** Selecting one records effective `unknown_user_defined` and surfaces a reserved-fallback advisory — its checklist does not exist yet, so it falls back to neutral to prevent false rigor:

`clinical` · `wet_lab` · `materials_physics` · `legal_case_based` · `education` — *not in enum yet; selecting this falls back to `unknown_user_defined`.*

## Field-guidance carry-forward (seeded from the deep-research evidence hierarchy)

The substance of the field-centric `## Field-Specific Adjustments` table in `../deep-research/references/source_quality_hierarchy.md` is carried forward here so no per-field guidance is silently dropped. The deep-research file is **read, not edited** — this is a one-time authoring copy, not a runtime dual-read.

Normative (folded into a ship-ready profile row above):
- **Social Science** → folded into `general_social_science` (Level III-V; mixed methods common).
- **Technology** → folded into `cs_ml` (Level III + industry reports; peer review lags reality).
- **Humanities** → folded into `humanities_interpretive` (Level VI primary sources; different epistemology — "evidence" means different things).
- **Policy** → folded into `general_social_science` (Level IV-V + VII expert panels; context-dependent, expert opinion valued). There is no dedicated Policy profile.

**Historical reference — non-normative; current behavior for these domains is neutral `unknown_user_defined` until the `clinical` / `education` profile ships:**
- **Medicine/Health** — Level I-II (RCTs, meta-analyses); Level I-III common; evidence-based-medicine tradition. *(maps to reserved `clinical`)*
- **Education** — Level III-IV (quasi-experimental); Level IV-VI common; randomization often impractical. *(maps to reserved `education`)*

These two rows are preserved verbatim for the eventual `clinical` / `education` profiles. They do NOT change runtime behavior today: until those reserved profiles ship, Medicine/Health and Education runs use the neutral `unknown_user_defined` pyramid, exactly as every other unmapped selection does.

## #246 forward reference

Discipline-relative *grade aggregation* (how these evidence expectations roll up into an Overall Grade) is tracked separately in #246 and is **not yet implemented**. Until #246 ships, the A-F Overall Grade lookup in `../deep-research/references/source_quality_hierarchy.md` applies unchanged. #259 ships no aggregation logic and no placeholder aggregation code.
