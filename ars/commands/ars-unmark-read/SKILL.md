---
name: ars-unmark-read
description: "ARS /ars-unmark-read — rescind a user-attested reading signal for one or more citation keys（ARS 命令入口）"
disable-model-invocation: true
---
Rescind a previously recorded `USER_ATTESTED_READ` declaration for the named citation key(s). Per v3.6.8 spec §3.6 firm rule 3, the session-scoped peer file `<passport-stem>_human_read_log.yaml` is append-only: rescind writes a `rescinded_at: <ISO 8601>` field on the matching entry rather than deleting it, so audit replay can reconstruct the user's signal trajectory. The next finalizer pass will demote any coverage-dependent `<!--ref:slug ok-->` back to `<!--ref:slug LOW-WARN-->` for each rescinded slug.

The dispatching agent substitutes `<path>` below with the active Material Passport path from session context before executing (the quoting is preserved so paths containing spaces remain a single argument). The CLI requires the citation_key to exist in `literature_corpus[]` AND to have an unrescinded prior mark in the read-log; hard-fails otherwise with the canonical `[ARS-MARK-READ ERROR: ...]` message.

Implementation:
```bash
python scripts/ars_mark_read.py <用户输入> --passport-path "<path>" --unmark
```

Mode reference: `docs/design/2026-04-30-ars-v3.6.8-trust-provenance-and-drift-transparency-spec.md` §3.6 + Step 7.

> DSH 运行说明：正文里的 `scripts/...` 指所调用技能目录下的脚本副本；`python` 由设置页选择的系统解释器提供，`bash` 由插件注入，不要改成 Claude Code 的插件根路径。
