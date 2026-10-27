# `batteryPulseFeatures` — HPPC / Pulse Test

Load this reference when the data is **pulse / HPPC** — short current pulses separated by rest periods, typically at multiple SOC levels. Extracts resistance and relaxation features (R0, RTotal, RecoveryRate) per detected pulse.

Follows the 6-phase workflow skeleton from SKILL.md (skips Phase 4 — no verifier helper for pulse). Phase 5 tuning guidance is inline in this file.

## Phase 1 — Identify Inputs

`batteryPulseFeatures` accepts a table (most common), three vectors, or a matrix. When passing a table, identify the following columns:

| Variable | Common column names |
|----------|---------------------|
| `CurrentVariable` | `Current`, `Current_A`, `I`, `I/mA`, `I/A`, `I_load`, `I_cell` |
| `VoltageVariable` | `Voltage`, `Voltage_V`, `V`, `V_cell`, `V_load`, `Ecell/V`, `Ewe/V`, `Ewe` |
| `TimeVariable` | `DateTime`, `Timestamp`, `Time`, `Test_Time`, `Step_Time`, `time/s`, `elapsed_time`, `t` |
| `StepIndexVariable` (optional but preferred) | `Step`, `Step_Index`, `Step_Number`, `StepIndex`, `Ns`, `State` |

Time must be `datetime` or `duration` (see § Pitfalls). Always pass `StepIndexVariable` when the column exists — change-point detection on current is a fallback, not the preferred path.

**API:**

```matlab
% Table input (most common):
[featureTable, pulseData] = batteryPulseFeatures(tbl, ...
    CurrentVariable="Current", ...
    VoltageVariable="Voltage", ...
    TimeVariable="Time", ...
    StepIndexVariable="Step", ...           % optional — auto-detects if omitted
    PostPulseMaxDuration=90, ...            % max relaxation time (s)
    ValidPulseDurationRange=[2, 60], ...    % [min, max] pulse duration (s)
    ValidVoltageRange=[0, inf], ...
    MinCurrentChange=1e-4);

% Three-vector input:
[featureTable, pulseData] = batteryPulseFeatures(voltage, current, time);

% Matrix input: [voltage, current, time] columns
[featureTable, pulseData] = batteryPulseFeatures(data);
```

**Output features (per pulse):**

| Feature | Description |
|---------|-------------|
| OCV | Open circuit voltage before pulse |
| R0 | Ohmic resistance (instantaneous V drop / I) |
| RTotal | Total resistance (V drop at end of pulse / I) |
| DeltaVoltage | Total voltage drop during pulse |
| RelaxationVoltage | Voltage at end of relaxation |
| RecoveryVoltage | Voltage recovered after pulse |
| RecoveryRate | Rate of voltage recovery (V/s) |
| Energy | Energy delivered during pulse (J) |
| VoltageMean | Mean voltage during pulse |
| VoltageStandardDeviation | Voltage std during pulse |

**Second output (`pulseData`):** Directionality, PulseCurrent, PulseDuration, PulseStartIndex, PulseEndIndex

## Phase 2 — Data Layout

Pulse tests usually arrive from the cycler as **one file per HPPC session** (one experiment). Detect the layout before extraction and load into a **MATLAB cell array of per-experiment tables** — the same loop then runs regardless of source.

### Layout 1 — Separate files, one per experiment (most common)

```matlab
files = dir(fullfile(dataDir, "*.csv"));
pulseData = cell(numel(files), 1);
sourceNames = strings(numel(files), 1);
for k = 1:numel(files)
    pulseData{k} = readtable(fullfile(files(k).folder, files(k).name));
    sourceNames(k) = string(files(k).name);
end
```

### Layout 2 — MATLAB cell array of tables

Each cell-array element is one experiment's per-sample table. No preprocessing — pass straight to the extraction loop below.

### Layout 3 — Single combined table with an indicator column

The combined table must carry an indicator column. Preferred keys (in order):
1. `ExperimentIndex` / `TestIndex` / `CycleIndex` — one integer per experiment for a single battery cell.
2. `CellID` — when the file contains multiple battery cells.

Split by the indicator before extraction:

```matlab
keyCol = "ExperimentIndex";              % or "CellID"
keys = unique(combinedTable.(keyCol), "stable");
pulseData = arrayfun(@(k) combinedTable(combinedTable.(keyCol) == keys(k), :), ...
    1:numel(keys), UniformOutput=false)';
```

### Fallback — no indicator column

If a combined table has multiple sessions and no `ExperimentIndex` / `CellID` / `CycleIndex`, split on a **rest-gap threshold**: contiguous rest current below `MinCurrentChange` lasting longer than the typical inter-session gap (e.g., > 10 min) marks a new experiment. Use only when no explicit indicator exists.

**Report the detected layout** (separate files / cell array / combined + indicator / fallback) in the after-extraction summary so the user knows how the output is organized.

## Phase 3 — Call the Function

Start with defaults:

```matlab
[features, pulses] = batteryPulseFeatures(hppcTable, ...
    CurrentVariable="Current", VoltageVariable="Voltage", ...
    TimeVariable="Time", StepIndexVariable="Step");
```

For multi-experiment data, loop over `pulseData` from Phase 2 and combine in Phase 6.

## Phase 5 — Tune Parameters (no verifier — tune on symptoms)

Pulse has no verifier helper. Recognize the symptoms and re-call:

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty feature table, warning "Unable to find valid pulses" | Detected pulses filtered out by duration or current-change bounds | Inspect step durations (see below); widen `ValidPulseDurationRange` or lower `MinCurrentChange`. |
| Real pulses split into two | Sampling-rate step gap taller than `MinCurrentChange` | Lower `MinCurrentChange` (e.g. `1e-5`). |
| Rest phase truncated in output | `PostPulseMaxDuration` shorter than actual relaxation | Raise `PostPulseMaxDuration` to the observed rest length. |
| Two separate sessions merged into one | `StepIndexVariable` omitted OR rest-gap fallback misfired | Provide `StepIndexVariable`, or split by indicator in Phase 2. |

**Diagnose empty output by inspecting per-step durations and mean currents:**

```matlab
if height(featureTable) == 0
    steps = unique(data.Step);
    for i = 1:numel(steps)
        mask = data.Step == steps(i);
        dur = seconds(data.Time(find(mask,1,'last')) - data.Time(find(mask,1)));
        meanI = mean(data.Current(mask));
        fprintf("Step %d: %.1fs, mean I = %.4f A\n", steps(i), dur, meanI);
    end
    % Identify pulse steps (short, non-zero current), then re-run with:
    [featureTable, pulseData] = batteryPulseFeatures(data, ...
        CurrentVariable="Current", VoltageVariable="Voltage", ...
        TimeVariable="Time", StepIndexVariable="Step", ...
        ValidPulseDurationRange=[1, 30], ...   % adjust to observed
        MinCurrentChange=0.01);                % adjust to observed
end
```

Parameter meanings:
- `ValidPulseDurationRange` — compute per-step durations; set bounds to capture actual pulse steps (e.g. `[1, 60]` for sub-second pulses, `[2, 600]` for GITT).
- `MinCurrentChange` — compute current magnitude during pulse steps; lower if pulses use very small currents (e.g. `0.01` or `0.001`).
- `PostPulseMaxDuration` — set based on observed rest/relaxation duration after pulses.

Without `StepIndexVariable`, detection uses `findchangepts` on current — always provide the step index column when the cycler exports one.

## Phase 6 — Postprocess / Organize Results

The output shape depends on how many battery cells the data covers.

### One battery cell, multiple experiments → one feature table with `ExperimentIndex`

```matlab
allFeatures = cell(numel(pulseData), 1);
for k = 1:numel(pulseData)
    [ft, ~] = batteryPulseFeatures(pulseData{k}, ...
        CurrentVariable="Current", VoltageVariable="Voltage", ...
        TimeVariable="Time", StepIndexVariable="Step");
    ft.ExperimentIndex = repmat(k, height(ft), 1);
    allFeatures{k} = ft;
end
featureTable = vertcat(allFeatures{:});
```

- One row per detected pulse.
- `ExperimentIndex` identifies which experiment produced each row.
- Trend `R0` / `RTotal` against `ExperimentIndex` (or the cycle count at each aging point) to see resistance growth.

### Multiple battery cells → cell array of feature tables, one element per battery cell

**Do not `vertcat` across battery cells.** Keep each battery cell's features in its own cell-array element. Different battery cells may have different pulse counts, SOC schedules, and aging schedules; pooling them upfront hides those differences.

```matlab
cellIDs = unique(combinedTable.CellID, "stable");   % or one per source file
featuresPerCell = cell(numel(cellIDs), 1);
for k = 1:numel(cellIDs)
    thisCellData = combinedTable(combinedTable.CellID == cellIDs(k), :);
    [ft, ~] = batteryPulseFeatures(thisCellData, ...
        CurrentVariable="Current", VoltageVariable="Voltage", ...
        TimeVariable="Time", StepIndexVariable="Step");
    ft.CellID = repmat(cellIDs(k), height(ft), 1);
    % If this battery cell has multiple experiments in its data:
    %   ft.ExperimentIndex = ...;
    featuresPerCell{k} = ft;
end
```

- `featuresPerCell{k}` = feature table for battery cell `cellIDs(k)`.
- Each per-cell table carries a `CellID` column (redundant with the index, but preserved for later concatenation when the user wants a cross-cell plot).
- If a battery cell has multiple experiments, its per-cell table also carries `ExperimentIndex`.

## Phase 7 — Report + Next Steps

Present the feature table with a workflow-specific report block, then stop and offer next steps.

> Extracted features across **M experiments** from **K battery cells** — **N detected pulses** total.
>
> **Key decisions:**
> - Column mappings: `Current` → CurrentVariable, `Voltage` → VoltageVariable, `Time` → TimeVariable, `Step` → StepIndexVariable {or "auto-detected via change points"}.
> - Pulse-detection settings: `ValidPulseDurationRange = [<a>, <b>] s`, `MinCurrentChange = <c> A`, `PostPulseMaxDuration = <d> s`.
> - Data layout: {separate files / cell array / combined + indicator / rest-gap fallback}.
>
> Per-battery-cell feature tables held in a cell array (`featuresPerCell{k}` for battery cell k). Each row = one detected pulse. Tag columns: `CellID`{, `ExperimentIndex` if multi-experiment per battery cell}.
>
> If any mapping or the pulse-detection thresholds look wrong, tell me and I'll re-run.

Then offer the four standing next steps per `SKILL.md § Stop After Extraction`. Workflow-specific hints — Visualize: overlay V and I on a detected pulse, `R0` vs SOC (or `ExperimentIndex`); Refine: adjust `ValidPulseDurationRange` / `MinCurrentChange` or re-split multi-experiment data. Only execute a next step when the user explicitly requests it.

## Pitfalls

- **Time format.** `TimeVariable` must be `datetime` or `duration`, NOT numeric seconds. Convert: `t = seconds(numericTime)` or `t = datetime(numericTime, ConvertFrom="posixtime")`.
- **0 pulses returned with no error.** `batteryPulseFeatures` returns an empty table when detected pulses are filtered out by `ValidPulseDurationRange` or `MinCurrentChange`. Diagnose by printing per-step durations and mean currents (see Phase 5) — do not silently ship an empty feature table.
- **Combined-file HPPC without an indicator column.** Rest-gap fallback splits are heuristic and can merge two experiments if the gap between them is shorter than the intra-experiment rest. Prefer providing `ExperimentIndex` or `CellID` explicitly.
- **StepIndex omitted on cyclers that do provide it.** Change-point detection on current is less reliable than the tester's own step boundaries — always pass `StepIndexVariable` when the column exists, even if the function accepts three-vector input.

## Feature Selection for Common Applications

Pulse data supports resistance characterization, cell screening, and (across pulses) aging trends. Which features to prioritize depends on the goal.

### For Cell Screening / Grading
- **Primary:** `R0` and `RTotal` variance across cells at matched SOC. High variance indicates manufacturing spread at the electrode/electrolyte interface.
- **Supporting:** `RecoveryRate`, `DeltaVoltage` at a fixed pulse magnitude.

### For RUL / Aging Assessment
- **Primary:** `R0` growth over time / cycle count (ohmic + SEI resistance increase).
- **Supporting:** `RTotal - R0` (polarization/charge-transfer component), `RecoveryRate` (electrolyte transport).

### For Fast Charging Optimization
- **Primary:** `RecoveryVoltage` and `RecoveryRate` at high SOC (post-pulse OCV recovery indicates lithium plating / diffusion limits).
- **Supporting:** `R0` at cold temperatures (limits achievable C-rate).

### For SOH Estimation (when only pulse data is available)
- **Primary:** `R0` at a reference SOC (e.g., 50%) tracked over aging.
- **Cross-data-type note:** Cycling `CycleCumulative` capacity or EIS `Arc1_Width` are typically more direct SOH indicators — prefer them if available (`references/cycling-pipeline.md`, `references/eis-features.md`).

----

Copyright 2026 The MathWorks, Inc.

----
