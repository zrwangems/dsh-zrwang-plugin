# Cycling: Verify and Tune Against a Tester Schedule (Route B)

Load this in addition to `references/cycling-pipeline.md` only when the **user provides the tester schedule** (per-step Type: CC / CV / Rest / CCCV). It replaces Route A (`verifySegmentation`) in Phase 4a and the Route A sweep in Phase 5. Do not chain the two routes — a schedule is authoritative when present.

Set the MATLAB current folder to the skill's `scripts/` directory (MCP `project_path`) — `verifyAgainstSchedule` and `sweepScheduleAndReport` live there.

## Phase 4a — Verify segmentation against the schedule

Build the schedule as a struct array (one entry per `Step_Index`) with `Type ∈ {"CC","CV","Rest","CCCV"}`. See `verifyAgainstSchedule.m` header for the full field list (`MinCoverage`, `MinCC`, `MinCV`, `TransitionVoltage`, `TransitionTol`, `MaxUndefinedFrac`, `MinSamples`).

```matlab
schedule = struct( ...
    'Step', {1, 2, 3, 4, 5}, ...
    'Type', {"CC", "CV", "Rest", "CC", "Rest"}, ...
    'MinCoverage', {0.85, 0.30, 0.95, 0.60, 0.95});
report = verifyAgainstSchedule(parser, schedule);
```

`report.PerCycle.AllStepsPass` tells you which cycles match the declared protocol. `report.PerGroup.Reason` names the failure mode per (Cycle, Step). CCCV steps additionally produce `report.AgingSignals` — transition voltage / CC-fraction / CV-fraction / taper duration per CCCV step — usable as protocol-derived features that the standard extractor misses.

The `MinSamples` gate in `verifyAgainstSchedule` runs before the mode check, so a step with fewer than `MinSamples` samples is reported as a data-collection failure (`"data-collection: only <n> samples (< <min>)"`) rather than being misclassified as a mode issue.

All cycles pass → continue with Phase 4b in `references/cycling-pipeline.md`. If any cycle fails, run the Phase 5 sweep below.

## Phase 5 — Tolerance sweep + data-collection exclusion

When schedule-based verification fails, cycles fall into three shapes:

1. **`alwaysPass`** — pass at every Tolerance in the sweep; no tuning needed.
2. **`tolSensitive`** — pass at some Tolerance values but not others; fixable by picking the right Tolerance.
3. **`neverPass`** — fail at every Tolerance; typically means truncated / missing samples (data-collection issue). **Never tune Tolerance to try to fix these; exclude them.**

`sweepScheduleAndReport` runs the sweep once, classifies each cycle, picks the largest Tolerance satisfying every `tolSensitive` cycle, and returns `neverPass` as `ExcludedCycles`:

```matlab
mapping = struct('CurrentVariable', "Current", 'VoltageVariable', "Voltage", ...
    'TimeVariable', "DateTime", 'CycleIndexVariable', "Cycle_Index", ...
    'StepIndexVariable', "Step_Index", 'TemperatureVariable', "Temperature");
out = sweepScheduleAndReport(tbl, schedule, mapping, [5e-5, 1e-5, 5e-6, 1e-6]);
parser.Tolerance = out.BestTol;
parser.ExcludedCycles = out.ExcludedCycles;
```

### When every cycle fails at every Tolerance — check the schedule before the data

If `sweepScheduleAndReport` classifies every cycle as `neverPass`, the schedule specification is more likely wrong than the data. Common cases:

- **Unreachable `MinCoverage`** on a soft-transition step (e.g., asserting `CV MinCoverage = 0.30` on a step where the CV portion is 0-15% for the true protocol) — no Tolerance value can bring the CV fraction above 30%. Set `MinCoverage = 0.0` on that step (soft check) and re-run.
- **Tester-inserted artifact steps** (1-3 sample steps between stages) declared in the schedule — those should not be asserted; drop them from `schedule`.
- **CCCV declared as separate CC + CV** or vice versa — check the tester log; a single composite step with both CC and CV samples must use `Type: "CCCV"`.

Only after the schedule has been reviewed and the sweep still fails should you conclude the data has a systematic collection issue.

### STOP: every cycle still `neverPass`

STOP and present `out.PassMap`, `out.PerToleranceReports{end}.PerCycle.FirstFailReason`, and the schedule that was asserted. The data may be pre-averaged or the chemistry may need a different classifier — ask the user before proceeding with a Tolerance choice or before dropping the schedule.

----

Copyright 2026 The MathWorks, Inc.

----
