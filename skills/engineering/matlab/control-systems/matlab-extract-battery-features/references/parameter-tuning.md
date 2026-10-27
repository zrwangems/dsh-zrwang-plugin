# Parameter Tuning — Tolerance and Differential Curves

Shared reference for tuning parameters that affect segmentation quality and IC/DV/DT curve fidelity. Load in addition to `cycling-pipeline.md` or `individual-cycling-functions.md` when:
- `verifySegmentation` reports `TuningRecommended == true` (mechanics in § Tolerance Log-Scale Sweep below)
- `verifySingleSegment` fails with an RSD or noise reason (§ Differential Curve Parameters)
- The user reports noisy curves, missing peaks, wrong CC/CV split, or "not CC data" errors
- Extracted feature counts differ across cells that share the same protocol (§ Feature-Set Consistency: VRange4Slope and VRange4TimeInterval)

## Tolerance (CC/CV mode identification)

`Tolerance` controls how the parser distinguishes CC from CV segments. Internally it is a **dV/dt threshold** (V/s): samples where `|dV/dt| < Tolerance` are classified as CV (voltage held steady); samples where `|dI/dt| < CurrentTolerance` (fixed at `1e-4`) are classified as CC (current held steady).

The default `5e-5` works for most lab data at ~1 Hz sampling. Adjust when CC/CV segmentation looks wrong:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Known CCCV protocol but parser labels everything as CC (no CV detected) | Tolerance too low — voltage noise exceeds threshold even during true CV | Increase Tolerance (try `1e-4` or `5e-4`) |
| CC segment appears truncated, CV starts too early | Tolerance too high — slow voltage rise at end of CC misclassified as CV | Decrease Tolerance (try `1e-5` or `5e-6`) |
| Very high sampling rate (>10 Hz) with noisy data | Small `dt` amplifies dV/dt values | Increase Tolerance proportionally |
| Low sampling rate (<0.1 Hz) or averaged data | Large `dt` yields very small dV/dt | Decrease Tolerance |

**Diagnostic approach:** After `segmentData(parser)`, check the `CyclingModes` column. If the CC/CV split doesn't match the expected protocol (e.g., a CCCV charge should have both CC and CV portions), adjust Tolerance and re-segment:

```matlab
parser.Tolerance = 1e-4;  % reset triggers re-segmentation on next call
segmented = segmentData(parser);
```

Typical useful range: `1e-6` to `1e-3`. Start from the default and adjust by one order of magnitude at a time.

### Tolerance Log-Scale Sweep (mechanics)

Invoked when `verifySegmentation(parser).TuningRecommended == true`. The verify helper decides *when* to tune; this section decides *what value* to pick.

**Hint from sampling rate.** Use `report.DiagnosticDt` (median seconds between samples):
- `dt <= 1` s → start the sweep at the default `5e-5`.
- `1 < dt <= 5` s → start at `5e-6`.
- `dt > 5` s → start at `1e-6` (the default is essentially guaranteed to mislabel plateau CC as CV at low rates).

**Sweep loop.** Iterate on a log grid, pick the *largest* Tolerance that drops `TuningRecommended` back to `false` (largest = most robust to noise while still correct). Sporadic outlier cycles keeping `MismatchCount > 0` are acceptable as long as `MismatchFraction` is below `MinMismatchFraction` (default 2%) — those should be inspected and optionally moved to `ExcludedCycles`, not driven to zero by shrinking Tolerance:

```matlab
tolCandidates = [5e-5, 1e-5, 5e-6, 1e-6, 5e-7, 1e-7];
bestTol = NaN;
for t = tolCandidates
    parser.Tolerance = t;                  % assignment re-triggers segmentation
    report = verifySegmentation(parser);
    if ~report.TuningRecommended
        bestTol = t;
        break;                              % largest passing value wins
    end
end
if isnan(bestTol)
    % STOP — sweep exhausted. Present report.MismatchGroups, the achieved
    % MismatchFraction, and the tried values to the user; do not silently
    % proceed with a guess.
end
```

Assigning to `parser.Tolerance` invalidates the cached segmentation, so the next call to `segmentData(parser)` (or `verifySegmentation`, which calls `segmentData` internally) uses the new value automatically. No manual reset.

**Why CV can be assigned on a falling voltage.** The internal `identifyMode` rule is `|dV/dt| < Tolerance → CV candidate` — it does not require V to actually be constant. On a slow discharge plateau at low sampling rate, the true dV/dt can be below the default 5e-5 V/s even though voltage is monotonically decreasing. Lowering Tolerance below the plateau's dV/dt is what restores CC classification.

**When the sweep can't fix it.** If every candidate leaves at least one mismatch, the fix is not Tolerance:
- Data may be pre-averaged (samples span multiple modes each) — no threshold recovers that.
- Chemistry may have a plateau flatter than any usable Tolerance (e.g., LFP mid-SOC). Consider extracting only from the non-plateau region.
- Column mapping may be wrong (Current column carries capacity, Voltage carries current, etc.). Re-verify column mappings before tuning.
- **Data-collection failure on a subset of cycles.** A single cycle with a truncated step (e.g., logger disconnected mid-cycle → step has 20 samples instead of 200) will never satisfy any Tolerance and pulls the sweep toward wrong choices for the healthy cycles. Distinguish this failure shape before tuning — see § Sweep-and-Classify below.

### Sweep-and-Classify (schedule-provided route)

When the user provides a tester schedule, use `sweepScheduleAndReport(tbl, schedule, mapping, tolGrid)` instead of the plain sweep. It classifies each cycle into one of three shapes and picks Tolerance only from the fixable shape:

| Shape | Definition | Action |
|-------|------------|--------|
| `alwaysPass` | Passes at every Tolerance in the grid | Ignore; already correct. |
| `tolSensitive` | Passes at some Tolerance values, fails at others | Pick the **largest** Tolerance that satisfies every cycle in this set. |
| `neverPass` | Fails at every Tolerance | Return as `ExcludedCycles`. Do **not** tune around them. |

The `MinSamples` gate inside `verifyAgainstSchedule` runs before the mode check, so a step with fewer than `MinSamples` samples is labeled `"data-collection: only <n> samples (< <min>)"` — a specific reason string, not a mode mismatch. This is what makes `neverPass` mean "data problem" rather than "wrong Tolerance." Without the gate, a truncated step looks like a Tolerance issue and the sweep either wastes cycles or picks a bad value trying to accommodate it.

```matlab
mapping = struct( ...
    'CurrentVariable', "Current", 'VoltageVariable', "Voltage", ...
    'TimeVariable', "DateTime", 'CycleIndexVariable', "Cycle_Index", ...
    'StepIndexVariable', "Step_Index", 'TemperatureVariable', "Temperature");
out = sweepScheduleAndReport(tbl, schedule, mapping, [5e-5, 1e-5, 5e-6, 1e-6]);

parser.Tolerance = out.BestTol;
parser.ExcludedCycles = out.ExcludedCycles;  % excluded neverPass cycles
```

`out` fields: `PassMap` (numCyc × numTol logical), `TolGrid`, `BestTol`, `ExcludedCycles`, `AlwaysPass`, `TolSensitive`, `FinalReport` (from `verifyAgainstSchedule` at `BestTol`), `PerToleranceReports` (per-Tolerance report array for diagnostics).

**Precheck the schedule when every cycle lands in `neverPass`.** Before assuming a systemic data problem, review the schedule. Common specification errors that mimic a data problem:

- Asserted `MinCoverage` is higher than the step's true CV/CC fraction (e.g., asserting 0.30 CV on a fast-CC step whose CV portion is 0-15%). Soften to `0.0` (presence check only).
- Tester-artifact steps (1-3 samples wedged between real stages) declared as real steps. Drop them from `schedule`.
- CCCV composite step declared as separate CC + CV entries (or vice versa). Use a single `Type: "CCCV"` entry with `MinCC` / `MinCV`.

Only if the schedule is right and every cycle still fails is this a systemic data problem — surface the report and stop.

## Feature-Set Consistency: `VRange4Slope` and `VRange4TimeInterval`

`batteryTestFeatureExtractor` computes two per-CC-step features whose availability depends on how much CC data falls inside a voltage window:

- `Step<N>_CC_slope` — linear fit of V vs t over samples where `V ∈ VRange4Slope` (default `[2.9, 3.2]` V).
- `Step<N>_CC_tInv` — duration in that same window.

The extractor drops all-NaN columns per phase before returning the feature table (`BatteryTestFeatureExtractor.m:344`). If a given cell never has ≥ 2 CC samples inside the window on any cycle, the whole column disappears. Across cells with different aging or slightly different operating windows, **this produces different feature counts for cells running the identical protocol** — silent, hard to debug from the extracted table alone.

**Diagnostic.** Before extraction, inspect the CC-segment voltage range per cell:

```matlab
seg = segmentData(parser);
ccMask = seg.CyclingModes == "CC";
vRange = [quantile(seg.(parser.VoltageVariable)(ccMask), 0.05), ...
          quantile(seg.(parser.VoltageVariable)(ccMask), 0.95)];
```

**Fix — pick a chemistry-appropriate window.** Pass explicit ranges when constructing the extractor so `slope` / `tInv` are computed on a window that actually contains CC samples for *every* cell:

```matlab
extractor = batteryTestFeatureExtractor( ...
    CyclingPhase="Discharge", CC=true, ...
    VRange4Slope=[3.0, 3.6], ...            % pick from the CC-voltage-range diagnostic
    VRange4TimeInterval=[3.0, 3.6]);
```

**Multi-cell rule.** Compute the CC voltage range for *every* cell; take the intersection (`max(mins), min(maxs)`); use that as `VRange4Slope` and `VRange4TimeInterval`. This guarantees every cell contributes to `slope` and `tInv` on every cycle, so feature counts stay aligned across the batch and cross-cell comparisons are valid.

**When the intersection is empty.** Cells are on materially different operating windows and cannot share a single feature set. Report to the user and ask whether to (a) group cells and extract separate feature sets per group, or (b) drop `slope`/`tInv` (they will not be cross-comparable regardless).

## Hidden Parameters (documented for symptom recognition, not user-tunable)

Some internal classifier constants are not exposed as public parser properties. Recognizing their symptoms lets the agent escalate to the user rather than retrying blindly:

| Constant | Value | Where | Symptom if it's the problem |
|----------|-------|-------|-----------------------------|
| `CurrentTolerance` (dI/dt threshold for CC) | `1e-4` A/s | `identifyMode.m` | High-C-rate cells with steppy current: entire CC step marked Undefined. |
| `NumMinConstantPoints` (min segment length) | `10` samples | `identifyMode.m` | Very short CC segments (< 10 samples) are silently discarded — no CC features for that step. |
| `currentAbsTolerance` (CCCV cross-check) | `0.2` A | `identifyMode.m` | CCCV protocols where the CC current level differs by > 0.2 A from the rounded median: partial CC coverage in the output. |

Route to the user with the symptom explicitly named, e.g. "step 4 has 8 CC samples which is below the internal 10-sample minimum — cannot extract CC features for this step. Increase sampling rate on that step or exclude the step."

## Differential Curve Parameters (IC/DV/DT quality)

These parameters control the resolution and smoothness of IC (dQ/dV), DV (dV/dQ), and DT (dT/dV) curves. Both the parser pipeline and `batteryDifferentialCurves` share the same underlying computation; their parameter names differ slightly:

| Concept | `batteryTestDataParser` | `batteryDifferentialCurves` |
|---------|------------------------|-----------------------------|
| Interpolation resolution | `NumInterpolatedPoints` (default 1000) | `NumInterpolatedPoints` (default 1000) |
| Post-computation smoothing window | `WindowSize` (default 10) | `PostSmoothingWindowSize` (default 10) |
| Post-computation smoothing method | Gaussian (fixed) | `PostSmoothingMethod` (default `'gaussian'`) |
| Pre-computation smoothing | N/A | `PreSmoothingMethod` (default `'none'`) + `PreSmoothingWindowSize` (default 10) |
| CC validation / noise floor | Handled by `Tolerance` (above) | `NoiseTolerance` (default `1e-4`) — validates that 95% of samples have `|dI/dt| < NoiseTolerance` |

**How they work together:**
1. Raw CC segment data is optionally pre-smoothed (standalone API only)
2. Data is interpolated to `NumInterpolatedPoints` evenly-spaced points → sets curve resolution
3. Differential is computed (dQ/dV, dV/dQ, dT/dV)
4. Result is smoothed with the post-smoothing window → controls noise suppression

**When to adjust:**

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Spurious small peaks in IC/DV curves | Under-smoothing — window too small relative to interpolation | Increase WindowSize/PostSmoothingWindowSize (try 15–20) |
| Real peaks merged or washed out; peak location shifted | Over-smoothing — window too large | Decrease to 5, or switch to `'sgolay'` (preserves peak shape better) |
| IC peaks look artificially sharp or show ringing | Short CC segments (<200 raw points) over-interpolated to 1000 | Reduce NumInterpolatedPoints to ~2–5× the raw point count |
| IC peaks look blunt, fine structure missing | High-resolution data (>5 Hz, thousands of raw points) under-sampled by interpolation | Increase NumInterpolatedPoints (try 2000–5000) |
| `batteryDifferentialCurves` throws "not CC data" error | dI/dt noise exceeds NoiseTolerance — common with noisy current sensors | Increase NoiseTolerance (try `5e-4` or `1e-3`) |
| Raw data very noisy but you want to preserve peak positions | Noise corrupts interpolation before smoothing can help | Enable pre-smoothing: `PreSmoothingMethod='sgolay'`, `PreSmoothingWindowSize=15` |

**Key relationship:** WindowSize is a fraction of NumInterpolatedPoints. Default ratio is 10/1000 = 1%. If you change NumInterpolatedPoints, scale the window proportionally to maintain similar smoothing:

```matlab
% Parser example
parser.NumInterpolatedPoints = 500;
parser.WindowSize = 5;  % keep ~1% ratio

% Standalone example
[dQdV, ~, ~] = batteryDifferentialCurves(V, I, T, t, ...
    NumInterpolatedPoints=2000, PostSmoothingWindowSize=20);
```

**Diagnostic approach:** Visually inspect one cycle's IC curve. Peaks should be smooth, clearly resolved, and located at physically meaningful voltages:

```matlab
% Parser pipeline
diffTable = computeDifferentialCurves(parser, cyclingPhase="Charge");
icData = diffTable.IC{1};
plot(icData.interpolatedVoltage, icData.IC);

% Standalone
[dQdV, ~, ~] = batteryDifferentialCurves(V, I, [], t);
plot(dQdV.interpolatedVoltage, dQdV.IC);
```

----

Copyright 2026 The MathWorks, Inc.

----
