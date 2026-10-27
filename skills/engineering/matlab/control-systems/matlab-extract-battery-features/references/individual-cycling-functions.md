# Individual Cycling Functions: `batteryMeasurementFeatures`, `batteryDifferentialCurves`, `batteryDifferentialCurveFeatures`

Load this reference when the data is a **single-phase cycling segment without a cycle index** (partial charge, one discharge phase, one CC segment). These functions don't require cycle/step index columns.

If the data is multi-cycle with cycle/step index, use the full pipeline instead — see `references/cycling-pipeline.md`.

For tuning smoothing / interpolation parameters, load `references/parameter-tuning.md`.

Follows the 7-phase workflow skeleton from SKILL.md. Phase 4 uses `verifySingleSegment`; Phase 5 tuning lives in `parameter-tuning.md`.

**Key dependency rule:** `IC`, `DV`, and `DT` features require **constant-current (CC)** data. `batteryDifferentialCurves` validates this internally (95% of samples must have `|dI/dt| < NoiseTolerance`); mixed CC+CV or CV-only data will error with "not CC data". If your segment is CV or mixed, use `batteryMeasurementFeatures` (which accepts any single-phase segment) for statistics/cumulative features only.

## Phase 1 — Identify Inputs

All three functions take **positional vectors** (`V`, `I`, `T`, `t`) rather than a table plus NV-pair column names. If the data arrives as a table, extract the vectors from these columns:

| Vector | Common column names |
|--------|---------------------|
| `V` (voltage) | `Voltage`, `Voltage_V`, `V`, `V_cell`, `V_load`, `Ecell/V`, `Ewe/V`, `Ewe` |
| `I` (current) | `Current`, `Current_A`, `I`, `I/mA`, `I/A`, `I_load`, `I_cell` |
| `T` (temperature, optional) | `Temperature`, `Temperature_C`, `Temp`, `T`, `T_cell`, `T_ambient`, `AuxT` |
| `t` (time) | `DateTime`, `Timestamp`, `Time`, `Test_Time`, `Step_Time`, `time/s`, `elapsed_time`, `t` |

Time must be `datetime` or `duration` (see § Pitfalls). Temperature is optional — pass `[]` when absent.

**APIs:**

```matlab
% Statistics + cumulative (any single-phase segment — CC, CV, or mixed):
featureTable = batteryMeasurementFeatures(V, I, T, t);
featureTable = batteryMeasurementFeatures(V, I);          % stats only
featureTable = batteryMeasurementFeatures(V, I, [], t);   % stats + cumulative, no temp

% Differential curves (CC segment ONLY — 95% of samples must have flat current):
[dQdV, dVdQ, dTdV] = batteryDifferentialCurves(V, I, T, t, ...
    NoiseTolerance=1e-4, ...
    PreSmoothingMethod='none', ...          % 'none','movmean','sgolay', etc.
    PreSmoothingWindowSize=10, ...
    PostSmoothingMethod='gaussian', ...     % default: 'gaussian'
    PostSmoothingWindowSize=10, ...
    NumInterpolatedPoints=1000, ...
    InterpolationMethod='linear');

% Peak features from a differential curve:
features = batteryDifferentialCurveFeatures(dQdV);                     % table input
features = batteryDifferentialCurveFeatures(curveValues, xAxisValues); % vector input
```

**Output — `batteryMeasurementFeatures`:**
- Voltage: max, min, mean, std, skewness, kurtosis
- Current: max, min, mean, std, skewness, kurtosis
- Temperature (if provided): max, min, mean, std
- Cumulative (if time provided): capacity (Ah), energy (Wh), duration, start voltage

**Output — `batteryDifferentialCurves`:**
- `dQdV` — columns: IC, interpolatedVoltage, interpolatedTime
- `dVdQ` — columns: DV, interpolatedTime, interpolatedVoltage
- `dTdV` — columns: DT, interpolatedVoltage, interpolatedTemperature (empty if T not provided)

**Output — `batteryDifferentialCurveFeatures`:** value, width, location (x-axis), prominence, area, left/right slopes, total area under curve, statistical features (per peak).

## Phase 2 — Data Layout

Individual-function inputs are always a **single per-sample table** (or four vectors) covering one segment. If the source is a multi-segment file, filter to the segment of interest first:

```matlab
% From a raw cycling table with a "Mode" or "Step_Index" column:
ccSegment = data(data.Mode == "CC", :);
% Or, if segmented via batteryTestDataParser:
segmented = segmentData(parser);
ccMask = segmented.CyclingModes == "CC" & segmented.CyclingPhases == "Discharge";
ccSegment = segmented(ccMask, :);
```

Multi-cell / multi-file: run this workflow per segment and collect results in a cell array — the same pattern as pulse and EIS.

## Phase 3 — Call the Function

Pick the function by what the segment supports:

| Segment shape | Function |
|---------------|----------|
| Any single-phase segment (partial/full charge or discharge; CC, CV, or mixed) | `batteryMeasurementFeatures` |
| Pure CC segment (validated by Phase 4) | `batteryDifferentialCurves`, then optionally `batteryDifferentialCurveFeatures` |

```matlab
V = segment.Voltage;
I = segment.Current;
T = segment.Temperature;
t = segment.Time;

stats = batteryMeasurementFeatures(V, I, T, t);
```

## Phase 4 — Verify Results

Use `verifySingleSegment` before either call — much cheaper than parsing a downstream MATLAB error and re-planning. The helper lives at `scripts/verifySingleSegment.m` — set the MATLAB current folder to the skill's `scripts/` directory (MCP `project_path`).

```matlab
% Before batteryDifferentialCurves — segment must be CC.
report = verifySingleSegment(ccSegment, "CC", ...
    CurrentVariable="Current", VoltageVariable="Voltage");
if ~report.Passed
    % Route to Phase 5 (tune) or STOP based on report.Reasons.
end

% Before batteryMeasurementFeatures — segment must not flip sign.
report = verifySingleSegment(segmentData, "single-phase", ...
    CurrentVariable="Current", VoltageVariable="Voltage");
if ~report.Passed
    % STOP — ask the user which sub-segment to analyze.
end
```

`report` fields:

| Field | Type | Meaning |
|-------|------|---------|
| `Kind` | string | Repeats the requested check kind (`"CC"`, `"single-phase"`, or `"any"`). |
| `Passed` | logical | `true` iff all requested checks passed. |
| `Reasons` | string array | Human-readable failure descriptions (empty on pass). |
| `Metrics` | struct | `rsdI`, `medianI`, `monotonicV`, `signChanges` — always populated. |

## Phase 5 — Tune Parameters (on Phase 4 failure)

Route the failure reason to the right fix:

| Verify reason | Fix path |
|---------------|----------|
| High `RSD_Current` on a CC check | Smoothing/noise parameters — see `parameter-tuning.md` § Differential Curve Parameters. Try `PreSmoothingMethod='sgolay'`, or raise `NoiseTolerance` (e.g. `5e-4`). |
| Non-monotonic V on a CC check | Segment straddles two phases. STOP; ask the user to point at a single sub-segment. |
| Rest-current signature (`|medI|` near 0) | No real CC phase. Switch to `batteryMeasurementFeatures` for statistics only. |
| `signChanges > 0` on a single-phase check | STOP — the segment includes both charge and discharge; ask which one to analyze. |

For symptom-driven tuning of `PreSmoothingMethod`, `PostSmoothingWindowSize`, `NumInterpolatedPoints`, and `NoiseTolerance`, see `references/parameter-tuning.md` § Differential Curve Parameters.

## Phase 6 — Postprocess / Organize Results

Individual-function outputs are per-segment feature tables. Common patterns:

```matlab
% Single segment: one feature table
stats = batteryMeasurementFeatures(V, I, T, t);

% Multiple segments (partial charges across a day, one per file):
segmentTables = cell(numel(files), 1);
for k = 1:numel(files)
    seg = readtable(files(k));
    segmentTables{k} = batteryMeasurementFeatures( ...
        seg.Voltage, seg.Current, seg.Temperature, seg.Time);
    segmentTables{k}.SegmentIndex = repmat(k, height(segmentTables{k}), 1);
end
featureTable = vertcat(segmentTables{:});

% Multiple cells: cell array of feature tables, one per cell (do not vertcat across cells).
```

For differential-curve pipelines, keep `dQdV` / `dVdQ` / `dTdV` around alongside `features` — the raw curves feed the visualization step when the user asks to overlay several segments.

## Phase 7 — Report + Next Steps

Present the feature table with a workflow-specific report block, then stop and offer next steps.

> Extracted features from a **<CC / single-phase / mixed>** segment — **N features** across **M rows**.
>
> **Key decisions:**
> - Column mappings: `Voltage` → V, `Current` → I, `Time` → t, `Temperature` → T {or "temperature not supplied"}.
> - Segment kind identified: {CC / single-phase / mixed CC+CV}. `verifySingleSegment` passed.
> - Function used: {`batteryMeasurementFeatures` for statistics/cumulative | `batteryDifferentialCurves` + `batteryDifferentialCurveFeatures` for IC/DV/DT peak features}.
> - Smoothing settings (differential only): `PostSmoothingMethod=<method>`, `PostSmoothingWindowSize=<n>`, `NumInterpolatedPoints=<n>`.
>
> If any mapping or the function choice looks wrong, tell me and I'll re-run.

Then offer the four standing next steps per `SKILL.md § Stop After Extraction`. Workflow-specific hints — Visualize: raw V/I/T, the IC/DV/DT curve, detected peaks overlaid; Refine: switch smoothing, adjust `NoiseTolerance`, or pick a different sub-segment. Only execute a next step when the user explicitly requests it.

## Pitfalls

- **Time format.** `t` must be `datetime` or `duration`, NOT numeric seconds. Convert: `t = seconds(numericTime)` or `t = datetime(numericTime, ConvertFrom="posixtime")` before calling `batteryMeasurementFeatures` or `batteryDifferentialCurves`.
- **DT curves without temperature.** `batteryDifferentialCurves` computes `dT/dV` only when `T` is passed and non-empty. Pass `[]` for `T` when temperature isn't available — do not fabricate a zero vector.
- **`batteryDifferentialCurves` requires pure CC data.** If a step contains both CC and CV portions (common in discharge steps), passing the full step data will error with "Current must remain constant and non-zero during CC mode." Filter to CC first (see Phase 2). Prefer the full pipeline (`batteryTestFeatureExtractor` + `extract`) which handles this filtering internally. Use `batteryDifferentialCurves` directly only when you need the raw IC/DV curve data (e.g. for overlaid curve plots).
- **Over-smoothing IC/DV curves.** Large `PostSmoothingWindowSize` destroys degradation-sensitive peaks. Start with default (10), increase only if data is very noisy. Validate visually. See `references/parameter-tuning.md` for symptom-driven tuning.

----

Copyright 2026 The MathWorks, Inc.

----
