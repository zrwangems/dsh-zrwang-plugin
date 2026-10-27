# Cycling Pipeline: `batteryTestDataParser` + `batteryTestFeatureExtractor`

Load this reference when the data is a **multi-cycle cycling table with cycle and step index columns**.

**Interaction model:** follow `SKILL.md § Interaction Model: Stop or Proceed` — apply deterministic rules, run the pipeline, then report mappings, CyclingPhase, and any data-quality findings in a single after-extraction turn. Do not gate on pre-extraction confirmations. The only STOP conditions specific to this workflow are (a) `checkCyclingProtocol` finds neither phase consistent, and (b) anomalous cycles detected (never silently exclude).

Follows the 7-phase workflow skeleton from SKILL.md. This file is the golden path for one battery cell in one file with no tester schedule. Load the files under `references/cycling/` only when their condition applies:

| Load | When |
|------|------|
| `references/cycling/multi-cell.md` | More than one file for a battery cell, or more than one battery cell (Phase 2 Layouts 2-3, Phase 6-7 per-battery-cell loop and report) |
| `references/cycling/schedule-verification.md` | The user provides the tester schedule (Phase 4a Route B and its Phase 5 sweep) |
| `references/cycling/tolerance-tuning.md` | `verifySegmentation` returns `TuningRecommended == true` (Phase 5 Route A) |
| `references/cycling/postprocess.md` | The user picks Visualize or Rank features after extraction |
| `references/cycling/feature-selection.md` | Choosing features for SOH / RUL / fast charging / cell screening, or interpreting a ranked list |

For tuning `Tolerance`, `WindowSize`, `NumInterpolatedPoints`, or diagnosing bad IC/DV/DT curves, also load `references/parameter-tuning.md`.

## Phase 1 — Identify Inputs

`batteryTestDataParser` takes a table plus NV-pair column mappings. Identify each of the following columns before constructing the parser:

| NV-pair | Common column names |
|---------|---------------------|
| `CurrentVariable` | `Current`, `Current_A`, `I`, `I/mA`, `I/A`, `I_load`, `I_cell` |
| `VoltageVariable` | `Voltage`, `Voltage_V`, `V`, `V_cell`, `V_load`, `Ecell/V`, `Ewe/V`, `Ewe` |
| `TimeVariable` | `DateTime`, `Timestamp`, `Time`, `Test_Time`, `Step_Time`, `time/s`, `elapsed_time`, `t` |
| `CycleIndexVariable` | `Cycle`, `Cycle_Index`, `CycleIndex`, `cycleIndex`, `Cycle_Number` |
| `StepIndexVariable` | `Step`, `Step_Index`, `Step_Number`, `StepIndex`, `Ns`, `State` |
| `TemperatureVariable` (optional) | `Temperature`, `Temperature_C`, `Temp`, `T`, `T_cell`, `T_ambient`, `AuxT` |

Time must be `datetime` or `duration` (see § Pitfalls). Temperature is optional — omit or set `TemperatureVariable=""` when absent.

**Multi-cell files** additionally carry a `CellID` / `Cell` / `SerialNumber` column — kept as a separate tag, not passed to the parser (see `references/cycling/multi-cell.md`).

### Required columns present? Handle missing ones before Phase 2

`CurrentVariable`, `VoltageVariable`, and `TimeVariable` are always required — if any is missing, this is a STOP (see SKILL.md § Interaction Model rule 3). For the others:

| Missing column | Do this |
|----------------|---------|
| `CycleIndexVariable` | Decide multi- vs single-cycle before synthesizing: <br>• **Multi-cycle** — step index resets (`any(diff(step) < 0)`) or current-sign flips multiple times: synthesize `cumsum(diff([0; step]) < 0)` or `cumsum(diff([0; sign(current)]) ~= 0)/2`. <br>• **Single full cycle** — step index present, no step resets, but the trace contains a full charge *and* discharge (current sign flips at least once, then never again): the whole record is one cycle. Synthesize `CycleIndex = ones(height(tbl),1)` and proceed — the parser still uses `StepIndex` for CC/CV/Rest segmentation and returns one row of cycle-level features. <br>• **Neither** (single partial segment, no full cycle boundary) — reroute to `references/individual-cycling-functions.md`. <br>Report which case was detected in the Phase 7 summary. |
| `StepIndexVariable` | The cycling pipeline needs step index for CC/CV/Rest classification; the parser cannot synthesize it. Reroute to `references/individual-cycling-functions.md` (which segments a single phase by current/voltage behavior). |
| `TemperatureVariable` | Set `TemperatureVariable=""` (or omit); set `DT=false` in the extractor. Statistics on temperature will not be extracted. Report this in the Phase 7 summary so the user knows thermal features were skipped. |
| Only a partial charge or discharge segment (no cycle boundaries at all) | Not a multi-cycle record — reroute to `references/individual-cycling-functions.md` (`batteryMeasurementFeatures` for statistics; `batteryDifferentialCurves` on the CC subset for IC/DV). |
| Voltage or current entirely (should not happen with a battery cycler) | STOP — this is not battery cycling data. |

## Phase 2 — Data Layout

Cycling data usually arrives from the cycler as **one file per test session** (a session may contain many cycles). Detect the layout first. For cycling the rule is **combine before parsing**.

### Layout 1 — One battery cell, one file

No preprocessing. Pass directly to `batteryTestDataParser` in Phase 3.

### Layouts 2 and 3 — Multiple files, or multiple battery cells

Load `references/cycling/multi-cell.md`. It covers concatenating multiple files for one battery cell (cycle-index offset) and combining multiple battery cells under a `CellID` tag, plus the per-battery-cell extraction loop and report.

**Report the detected layout** in the Phase 7 summary so the user knows how the output is organized.

## Phase 3 — Call the Functions (parse + segment)

Create `batteryTestDataParser` with the column mappings from Phase 1, then segment:

```matlab
parser = batteryTestDataParser(tbl, ...
    CurrentVariable="Current_A", ...
    VoltageVariable="Voltage_V", ...
    TimeVariable="Time", ...
    CycleIndexVariable="Cycle", ...
    StepIndexVariable="Step", ...
    TemperatureVariable="Temperature_C", ...
    ExcludedCycles=[], ...
    Tolerance=5e-5, ...
    NumInterpolatedPoints=1000, ...
    WindowSize=10);

segmented = segmentData(parser);
```

`segmentData` introduces three columns: `CyclingModes` (CC/CV/Rest), `CyclingPhases` (Charge/Discharge/Rest), and `IsValid` (logical). Data points that cannot be definitively classified are marked `IsValid=false` and excluded from analysis.

Column mappings are chosen by the router's deterministic rules (see `SKILL.md § Column Mapping: General Rules`) — datetime/duration beats numeric time, etc. Do **not** ask the user to confirm mappings before running the parser; report them in the Phase 7 summary.

The feature-extractor half of the pipeline (`batteryTestFeatureExtractor` + `extract`) runs in Phase 6 — after segmentation is verified and CyclingPhase is chosen.

## Phase 4 — Verify Results

Three verification concerns run here. The first two are hard gates (route to Phase 5 tuning or STOP on failure); the third is a silent data-quality report line surfaced in Phase 7.

### 4a. Verify Segmentation

`segmentData` uses `Tolerance` (dV/dt threshold, default 5e-5 V/s) to decide CC vs CV. The default fails on low-sample-rate data (dt > 5 s) and on chemistries with flat plateaus, silently mislabeling CC segments as CV — which then propagates to wrong feature counts and missing IC/DV curves. Verify before extracting.

**Two verification routes — pick by whether the user provided a tester schedule.** Do not chain them; a schedule is authoritative when present.

| User input | Route | Helper |
|------------|-------|--------|
| No schedule (default) | Raw-signal RSD signature vs `CyclingModes` | `verifySegmentation(parser)` |
| Schedule provided (per-step Type: CC / CV / Rest / CCCV) | Strict per-step assertions + CCCV interior check | `verifyAgainstSchedule(parser, schedule)` + `sweepScheduleAndReport(...)` for Tolerance sweep with data-collection exclusion |

Set the MATLAB current folder to the skill's `scripts/` directory (MCP `project_path`) — both helpers live there.

#### Route A — No schedule provided

```matlab
report = verifySegmentation(parser);
```

`report` fields:

| Field | Type | Meaning |
|-------|------|---------|
| `RawSignatureTable` | table | Per `(Cycle, Step)`: `RSD_Current`, `MedianCurrent_A`, `Expected` mode (CC / Rest / Undefined) from the raw signal. |
| `SegmentationTable` | table | Per `(Cycle, Step)`: `CC_Pct`, `CV_Pct`, `Rest_Pct` from `segmentData`. |
| `MismatchGroups` | table | The `(Cycle, Step)` rows where expected disagrees with observed, plus a `Reason` string. |
| `MismatchCount` | integer | `height(MismatchGroups)`. |
| `MismatchFraction` | double | `MismatchCount / (total groups)`. |
| `TuningRecommended` | logical | `true` when `MismatchFraction > MinMismatchFraction` (default 2%). Sporadic single-cycle outliers below the threshold do not trip tuning — they are typically per-cycle data artifacts, not a systematic Tolerance mis-set. |
| `DiagnosticDt` | double | Median inter-sample dt in seconds. Use as a starting hint for the Tolerance sweep. |

**Agent action:**

1. **`TuningRecommended == false`** → proceed to 4b. If `MismatchCount > 0` (sporadic outliers below the fraction threshold), surface the mismatched `(Cycle, Step)` rows as a one-line finding in the Phase 7 report so the user can decide to `ExcludedCycles` them; do not force a Tolerance sweep.

2. **`TuningRecommended == true`** → go to Phase 5 and load `references/cycling/tolerance-tuning.md` for the log-scale Tolerance sweep.

#### Route B — Schedule provided

Load `references/cycling/schedule-verification.md` and follow its Phase 4a (schedule struct, `verifyAgainstSchedule`) and, if any cycle fails, its Phase 5 sweep. Then return here for 4b.

### 4b. Protocol Consistency & CyclingPhase Selection

Run `checkCyclingProtocol` to assess whether the cycling protocol is consistent across cycles. Set the MATLAB current folder to the skill's `scripts/` directory (pass its absolute path as the MCP tool's `project_path`) — do **not** call `addpath`. The script lives at `scripts/checkCyclingProtocol.m` alongside the verifier helpers.

```matlab
result = checkCyclingProtocol(parser);
```

`result` is a struct with these fields (agent should not need to read the script source):

| Field | Type | Meaning |
|-------|------|---------|
| `RecommendedPhase` | string: `"Charge"` \| `"Discharge"` \| `"Both"` | The `CyclingPhase` to pass to the extractor. `"Both"` when both phases are consistent. |
| `ChargeConsistent` | logical | `true` if charge-step protocol is repeatable across the majority cycles. |
| `DischargeConsistent` | logical | `true` if discharge-step protocol is repeatable across the majority cycles. |
| `AnomalousCycles` | numeric vector | Cycle indices whose step sequence does not match the dominant protocol. STOP trigger — never silently exclude. |
| `MajorityCycles` | numeric vector | Cycle indices matching the dominant protocol; used to compute consistency flags. |
| `NumCycles` | integer | Total cycles in the parsed data. |
| `StepTable` | table | Per-step statistics (C-rate, voltage limits, duration) for the majority cycles — the reference protocol. |

The same `parser` object is reused for extraction in Phase 6 (with `ExcludedCycles` added if a STOP fires on anomalous cycles and the user confirms exclusion).

**Agent should:**

1. **Pick CyclingPhase from `result.RecommendedPhase`** and justify the choice by citing the repeating C-rate and voltage limits from the reference protocol table. The choice is purely about protocol consistency — do **not** justify it with the user's analysis goal (SOH, RUL, etc.).

2. **Surface goal-vs-data tension in the report, but do not let it change the phase choice.** If the consistent phase is not the one conventionally associated with the user's stated goal (SOH and lithium-inventory loss → charge-side IC / dQ-dV; discharge only when the user explicitly asks about delivered-capacity fade), say so in the Phase 7 report. For an SOH goal, choosing `Discharge` is always a tension to report — even though discharge capacity also trends with SOH:
   > You asked about **<goal>**, which conventionally leans on **<charge/discharge>**-side features. In your data, the **<charge/discharge>** protocol varies across cycles, so those features would not trend on a fixed baseline. Only the **<other>** protocol is consistent, so I extracted from there. Here's what the consistent phase can still tell you about **<goal>**: <what it can / can't deliver>.

   This is a report line, not a phase-selection input.

3. **STOP condition — anomalous cycles.** If `result.AnomalousCycles` is non-empty, do **not** silently exclude them. Present the list and ask before proceeding:
   > The protocol check found **N anomalous cycles** (X.X%) with non-standard step sequences: [list or first 10].
   > These cycles likely have data-collection issues (missing steps). Exclude them (`ExcludedCycles=[...]`) and re-run?

   Only add `ExcludedCycles` after the user confirms. This is one of two places in the cycling workflow where it legitimately blocks (the other is STOP condition 4).

4. **STOP condition — no consistent phase.** If neither `ChargeConsistent` nor `DischargeConsistent` is true, present the reference protocol table (C-rates, voltage limits, consistency flags) and ask which phase to extract from. Do not default silently.

### 4c. Data-Quality Signals (silent — surface in Phase 7)

Compute these two signals silently — they are **reporting inputs**, not gates. Include the numbers in the Phase 7 after-extraction report; do not pause the workflow.

**Time anomalies.** Battery cyclers sometimes have unexpectedly long gaps between data points (e.g., computer auto-restarts during multi-day tests). Detect and count them:

```matlab
timeCol = segmented.(parser.TimeVariable);
if isdatetime(timeCol) || isduration(timeCol)
    timeDiffSec = seconds(diff(timeCol));
else
    timeDiffSec = diff(timeCol);
end
longInterval = 3600;  % threshold in seconds (1 hour)
longIdx = find(timeDiffSec > longInterval) + 1;
```

Include the count (and the first few indices) as a **one-line report finding** in the Phase 7 summary. If a long gap coincides with an anomalous cycle from 4b, that is a STOP condition (see 4b, anomalous-cycles rule).

**Invalid data points.** The parser automatically flags ambiguous points as `IsValid=false`. Compute the fraction:

```matlab
nInvalid = sum(~segmented.IsValid);
invalidPct = 100 * nInvalid / height(segmented);
```

Include `nInvalid` / total / percent in the Phase 7 report. A small fraction (<1%) is normal (mode transitions). If a large fraction is invalid, mention that the column mappings or `Tolerance` may need adjustment (`references/parameter-tuning.md`) — mention as a suggestion, not a gate.

## Phase 5 — Tune Parameters (on Phase 4 failure)

Runs only when Phase 4a fails. Load the file for the route you are on:

- **Route A** (`TuningRecommended == true`) → `references/cycling/tolerance-tuning.md` — log-scale Tolerance sweep and its STOP condition.
- **Route B** (a cycle fails the schedule) → `references/cycling/schedule-verification.md` § Phase 5 — sweep with data-collection exclusion.
- **Noisy or flattened IC/DV/DT curves** → `references/parameter-tuning.md` § Differential Curve Parameters.

Skip Phase 5 entirely when the user has already fixed Tolerance in an earlier turn and the current call is a re-run.

## Phase 6 — Postprocess / Organize Results

With segmentation verified (Phase 4) and Tolerance tuned if needed (Phase 5), call the extractor to produce the feature table. The code below is for one battery cell; for multiple battery cells, loop per battery cell as shown in `references/cycling/multi-cell.md` § Phase 6.

### Feature extraction — single battery cell

```matlab
extractor = batteryTestFeatureExtractor( ...
    CyclingPhase="Charge", ...  % 'Charge', 'Discharge', or 'Both' (from Phase 4b)
    Statistics=true, ...         % Voltage/current/temp statistics
    CycleCumulative=true, ...    % Capacity, energy, duration
    CC=true, ...                 % Constant-current segment features
    CV=true, ...                 % Constant-voltage segment features
    CCCV=true, ...               % CC+CV combined features
    IC=true, ...                 % Incremental capacity curve features
    DV=false, ...                % Differential voltage curve features
    DT=false);                   % Differential temperature curve features

featureTable = extract(extractor, parser);
```

One row per cycle; the cycle-index column is the main x-axis for trending.

#### Feature Categories (165+ features total)

| Category | Property | Features | Tracks |
|----------|----------|----------|--------|
| **Statistics** | `Statistics=true` | max, min, mean, std, skewness, kurtosis of V, I, T | General degradation trends |
| **CycleCumulative** | `CycleCumulative=true` | Capacity (Ah), energy (Wh), duration, start voltage | Capacity fade, energy efficiency |
| **CC** | `CC=true` | CC duration, median current, slope, energy, skewness, kurtosis | CC phase degradation |
| **CV** | `CV=true` | CV duration, median voltage, slope, energy, skewness, kurtosis | CV phase degradation |
| **CCCV** | `CCCV=true` | Energy ratio (CC/CV), energy difference | Phase balance shift |
| **IC** | `IC=true` | Peak value, width, location, prominence, area, slopes | Electrode degradation mechanisms |
| **DV** | `DV=true` | Peak features from dV/dQ curve | Electrode capacity balance |
| **DT** | `DT=true` | Peak features from dT/dV curve | Thermal degradation signatures |

**Dependency: IC, DV, and DT require `CC=true`.** These differential curve features are computed from CC segments identified by the parser. If `CC=false`, no CC segments are identified and IC/DV/DT will silently produce no features. Always set `CC=true` when enabling IC, DV, or DT.

**CCCV requires both `CC=true` and `CV=true`.** The extractor handles this automatically.

## Phase 7 — Report + Next Steps

Present a **single after-extraction report** containing everything the user needs to spot-check the run:

### Single battery cell

> Feature extraction complete — **M features** across **N cycles**.
>
> **Key decisions:**
> - Column mappings:
>   - `CurrentVariable` → "…" (any alternative considered)
>   - `VoltageVariable` → "…"
>   - `TimeVariable` → "…"
>   - `CycleIndexVariable` → "…", `StepIndexVariable` → "…"
>   - `TemperatureVariable` → "…"
> - CyclingPhase → "Charge" — consistent C-rate <X> and voltage limits <a-b V> across all cycles.
> - Feature categories: [list enabled categories]; `DT` = <true/false> (temperature <present/absent>).
> - Tolerance = <value> {default | tuned from Phase 5 sweep}.
>
> Data quality: <k> long time gaps (> 1 h); <n>/<total> invalid points (<pct>%). <optional: note if suggests Tolerance retune>
>
> If any mapping or the phase choice looks wrong, tell me and I'll re-run.

For multiple battery cells, use the report in `references/cycling/multi-cell.md` § Phase 7 instead.

Then **stop and offer the four standing next steps** (Visualize / Rank features / Export / Refine) exactly as defined in `SKILL.md § Stop After Extraction` — Visualize and Rank load `references/cycling/postprocess.md`. Only execute a next step when the user explicitly requests it.

### Visualization & Feature Ranking (next-step options)

When the user picks **Visualize** or **Rank features**, load `references/cycling/postprocess.md` — it has the plot-type table (segmented data, IC/DV/DT overlays, feature trends) and the correlation-ranking recipe. Do not run either before the feature table is extracted and reported.

## Complete Workflow Example

Deterministic-rule path: parse+segment (Phase 3) → `verifySegmentation`, sweeping Tolerance via the Phase 5 loop if `TuningRecommended` (Phase 4a) → silent data-quality signals (Phase 4c: `longIdx`, `nInvalid`) → `checkCyclingProtocol` for `RecommendedPhase` (Phase 4b) → `extract` with the chosen phase + categories (Phase 6) → single after-extraction report (Phase 7). No pre-extraction gate; STOP only on anomalous cycles, no consistent phase, or a Tolerance sweep exhausted on substantive steps (1-3-sample artifact steps are benign — see `references/cycling/tolerance-tuning.md`). The per-phase code blocks above are the canonical copies — follow them in order.

## Pitfalls

- **Mixing charge and discharge data.** Both parser and extractor require CyclingPhase to be set correctly. Features extracted from mixed phases are not meaningful for degradation trending.
- **Time format.** Time must be `datetime` or `duration`, NOT numeric seconds. Convert: `t = seconds(numericTime)` or `t = datetime(numericTime, 'ConvertFrom', 'posixtime')`.
- **Missing temperature for DT curves.** Set `DT=true` only when temperature data is present; set `DT=false` when it is not.
- **Extracting all features blindly.** 165+ features with <50 cycles = overfitting risk. Use `references/cycling/feature-selection.md` to pick physically meaningful subsets.
- **Capacity/energy depend on unit correctness.** Capacity is computed internally as Ah via `cumtrapz(I, t)/3600` — so `I` must be in Amps and `t` in seconds/duration. Passing mA or mV silently produces wrong-scaled `Capacity` / `Energy` / `CycleCumulative` features without erroring; convert unit-suffixed columns before constructing the parser.

----

Copyright 2026 The MathWorks, Inc.

----
