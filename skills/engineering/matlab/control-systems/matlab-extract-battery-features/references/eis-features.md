# `batteryEISFeatures` — Electrochemical Impedance Spectroscopy

Load this reference when the data is **EIS / impedance** — frequency, real impedance (`Zreal`), and imaginary impedance (`Zimag`) vectors, often at multiple aging points. Extracts Nyquist-plot features (R0, arc widths, tail slope) by fitting semicircles.

Follows the 6-phase workflow skeleton from SKILL.md (skips Phase 4 — no verifier helper for EIS). Phase 5 tuning guidance is inline in this file.

## Phase 1 — Identify Inputs

`batteryEISFeatures` takes **positional vectors**, not name-value pairs on the required arguments. Identify three columns in the input data (or three variables in a struct) and pass them by position:

| Role | Common column names |
|------|---------------------|
| Real impedance (`Zreal`) | `Zreal`, `Zre`, `Z_re`, `Re(Z)`, `ReZ`, `Zreal_Ohm`, `Re(Z)/Ohm` |
| Imaginary impedance (`Zimag`) | `Zimag`, `Zim`, `Z_im`, `Im(Z)`, `ImZ`, `Zimag_Ohm`, `Im(Z)/Ohm`, `-Im(Z)/Ohm` (sign-flipped — see Pitfalls) |
| Frequency | `Frequency`, `Freq`, `f`, `freq/Hz`, `Frequency_Hz`, `f/Hz` |

**Input requirements:**
- `Zreal` — real impedance, must be non-negative.
- `Zimag` — imaginary impedance. Sign convention is auto-detected but the caller must know whether the column is stored as `Im(Z)` or `-Im(Z)` (see Pitfalls).
- `Frequency` — must be positive, unique, in Hz. Convert `omega` (rad/s) with `f_Hz = omega / (2*pi)`.

**API:**

```matlab
featureTable = batteryEISFeatures(Zreal, Zimag, Frequency, ...
    NumArcs=1, ...                  % 0, 1, or 2 arcs to detect
    Plot=false, ...                 % visualize results
    SmoothingWindowSize=5);         % adaptive if omitted
```

**Output features:**

| Feature | Description |
|---------|-------------|
| R0 | High-frequency resistance (real-axis intercept) |
| R0_Frequency | Frequency at R0 |
| Arc1_End_Zreal | Real impedance at end of arc 1 |
| Arc1_End_Zimg | Imaginary impedance at end of arc 1 |
| Arc1_Width | Horizontal width of arc 1 |
| Arc1_Peak_Zreal | Real impedance at arc 1 peak |
| Arc1_Peak_Zimg | Imaginary impedance at arc 1 peak |
| Arc1_Peak_Frequency | Frequency at arc 1 peak |
| Arc1_End_Frequency | Frequency at arc 1 end |
| TailSlope | Slope of diffusion tail |
| TailIntercept_Zreal | X-intercept of tail line |

(Arc2 features added when `NumArcs=2`.)

## Phase 2 — Data Layout

EIS data usually arrives from the instrument as **one file per sweep** (one experiment). Detect the layout before extraction and load into a **MATLAB cell array of per-experiment tables**.

### Layout 1 — Separate files, one per sweep (most common)

```matlab
files = dir(fullfile(dataDir, "*.csv"));
eisData = cell(numel(files), 1);
for k = 1:numel(files)
    eisData{k} = readtable(fullfile(files(k).folder, files(k).name));
end
```

### Layout 2 — MATLAB cell array of tables

Each cell-array element = one sweep. No preprocessing.

### Layout 3 — Single combined table with an indicator column

The combined table must carry an indicator column. Preferred keys (in order):
1. `ExperimentIndex` / `TestIndex` / `CycleIndex` — one integer per sweep for a single battery cell.
2. `CellID` — when the file contains multiple battery cells.

Split by the indicator before extraction:

```matlab
keyCol = "ExperimentIndex";              % or "CellID"
keys = unique(combinedTable.(keyCol), "stable");
eisData = arrayfun(@(k) combinedTable(combinedTable.(keyCol) == keys(k), :), ...
    1:numel(keys), UniformOutput=false)';
```

### Fallback — no indicator column, split on frequency-direction reversal

`batteryEISFeatures` requires unique frequency values per call. If a single table contains multiple sweeps with the same frequencies repeated and no indicator column, detect sweep boundaries where the frequency direction reverses:

```matlab
try
    features = batteryEISFeatures(Zreal, Zimag, Frequency);
catch e
    if contains(e.message, "unique")
        freqDiff = diff(Frequency);
        if Frequency(1) > Frequency(2)                 % descending
            sweepStarts = [1; find(freqDiff > 0) + 1];
        else                                            % ascending
            sweepStarts = [1; find(freqDiff < 0) + 1];
        end
        sweepEnds = [sweepStarts(2:end)-1; numel(Frequency)];
        eisData = arrayfun(@(s) table(Zreal(sweepStarts(s):sweepEnds(s)), ...
                                      Zimag(sweepStarts(s):sweepEnds(s)), ...
                                      Frequency(sweepStarts(s):sweepEnds(s)), ...
                                      VariableNames=["Zreal","Zimag","Frequency"]), ...
                           1:numel(sweepStarts), UniformOutput=false)';
    else
        rethrow(e);
    end
end
```

Use only when no explicit indicator exists.

**Report the detected layout** (separate files / cell array / combined + indicator / fallback) in the after-extraction summary so the user knows how the output is organized.

## Phase 3 — Call the Function

Start with defaults and let sign/duplicate-frequency errors trigger the fallback path:

```matlab
features = batteryEISFeatures(Zreal, Zimag, freq, NumArcs=1);
```

For multi-sweep data, loop over `eisData` from Phase 2 and combine in Phase 6.

## Phase 5 — Tune Parameters (no verifier — tune on symptoms)

EIS has no verifier helper. Recognize the symptoms and re-call:

| Symptom | Cause | Fix |
|---------|-------|-----|
| Warning "Detected fewer arcs than requested" | `NumArcs` too high for visible geometry | Inspect the Nyquist plot (`Plot=true`); count visible semicircles; drop `NumArcs`. |
| Error about duplicate frequencies | Multi-sweep data in one table | Use the fallback split from Phase 2. |
| Arc detection lands on wrong quadrant | `Zimag` sign flipped | Multiply `Zimag` by `-1` before calling. |
| R0 far off the visible real-axis intercept | Frequency unit mismatch | Convert rad/s → Hz (`f / (2*pi)`). |
| Noisy features across otherwise-similar sweeps | Very few points (<20) or noisy hardware | Increase `SmoothingWindowSize` (try 7–11); more points > more smoothing. |

- `NumArcs` — default `1`. Set based on visible semicircles in the Nyquist plot: `0` for R0 + tail only, `1` for one semicircle, `2` only when two distinct arcs are visible. Plot the data first to determine the correct value.
- `SmoothingWindowSize` — default is adaptive. Only adjust if data is very noisy or has very few points.

## Phase 6 — Postprocess / Organize Results

The output shape depends on how many battery cells the data covers.

### One battery cell, multiple sweeps → one feature table with `ExperimentIndex`

```matlab
allFeatures = cell(numel(eisData), 1);
for k = 1:numel(eisData)
    d = eisData{k};
    ft = batteryEISFeatures(d.Zreal, d.Zimag, d.Frequency, NumArcs=1);
    ft.ExperimentIndex = repmat(k, height(ft), 1);
    allFeatures{k} = ft;
end
featureTable = vertcat(allFeatures{:});
```

- One row per sweep.
- `ExperimentIndex` identifies which sweep produced each row.
- Trend `R0` and `Arc1_Width` against `ExperimentIndex` (or cycle count at each aging point) to see impedance growth.

### Multiple battery cells → cell array of feature tables, one element per battery cell

**Do not `vertcat` across battery cells.** Keep each battery cell's features in its own cell-array element.

```matlab
cellIDs = unique(combinedTable.CellID, "stable");   % or one per source file
featuresPerCell = cell(numel(cellIDs), 1);
for k = 1:numel(cellIDs)
    thisCellData = combinedTable(combinedTable.CellID == cellIDs(k), :);
    ft = batteryEISFeatures(thisCellData.Zreal, thisCellData.Zimag, thisCellData.Frequency, NumArcs=1);
    ft.CellID = repmat(cellIDs(k), height(ft), 1);
    % If this battery cell has multiple sweeps in its data:
    %   ft.ExperimentIndex = ...;
    featuresPerCell{k} = ft;
end
```

- `featuresPerCell{k}` = feature table for battery cell `cellIDs(k)`.
- Each per-cell table carries a `CellID` column.
- If a battery cell has multiple sweeps, its per-cell table also carries `ExperimentIndex`.

## Phase 7 — Report + Next Steps

Present the feature table with a workflow-specific report block, then stop and offer next steps.

> Extracted features across **M sweeps** from **K battery cells**.
>
> **Key decisions:**
> - Column mappings: `Zreal` → "…", `Zimag` → "…" (sign convention: {as-stored | flipped}), `Frequency` → "…" (unit: Hz).
> - `NumArcs = <n>` (chose from visible semicircle count).
> - Data layout: {separate files / cell array / combined + indicator / freq-direction fallback}.
>
> Per-battery-cell feature tables held in a cell array (`featuresPerCell{k}` for battery cell k). Each row = one sweep. Tag columns: `CellID`{, `ExperimentIndex` if multi-sweep per battery cell}.
>
> If any mapping or the arc count looks wrong, tell me and I'll re-run.

Then offer the four standing next steps per `SKILL.md § Stop After Extraction`. Workflow-specific hints — Visualize: Nyquist plot with detected arcs overlaid, or `R0` / `Arc1_Width` vs `ExperimentIndex`; Refine: change `NumArcs`, adjust smoothing, or re-split multi-sweep data. Only execute a next step when the user explicitly requests it.

## Pitfalls

- **Duplicate frequencies** → multi-sweep data, split into individual sweeps (see Phase 2).
- **NumArcs too high** → warning "Detected fewer arcs than requested". Inspect the Nyquist plot: count visible semicircles.
- **Zreal has negative values** → check units/offset. Function requires non-negative Zreal.
- **Sign convention on Zimag.** Some exports carry `-Im(Z)/Ohm` (Nyquist-plot convention). Pass the raw imaginary part with its original sign — flip it if the column is stored as `-Zimag`, otherwise arc detection lands on the wrong quadrant.
- **Frequency in Hz.** `batteryEISFeatures` expects Hz. Convert if the source uses rad/s (`f_Hz = omega / (2*pi)`).

## Feature Selection for Common Applications

EIS features map to physical processes (ohmic, charge-transfer, diffusion). Which to prioritize depends on the goal.

### For SOH / Capacity Estimation
- **Primary:** `Arc1_Width` (charge-transfer resistance grows with SEI/electrode aging).
- **Supporting:** `R0` (ohmic component; captures contact and electrolyte resistance).

### For RUL / End-of-Life Prediction
- **Primary:** `R0` growth trend and `Arc1_Width` trend over aging points.
- **Supporting:** `TailSlope` (Warburg diffusion) — trends indicate electrolyte degradation.

### For Cell Screening / Grading
- **Primary:** `Arc1_Width` variance across cells (manufacturing spread at electrode/electrolyte interface).
- **Supporting:** `R0` variance, `Arc1_Peak_Frequency` variance (time-constant spread).

### For Fast Charging Feasibility
- **Primary:** `R0` at low temperature (ohmic loss and heating).
- **Supporting:** `Arc1_Width` at high SOC (charge-transfer bottleneck at plating onset).
- **Cross-data-type note:** Pulse-based `RecoveryRate` is a more direct plating indicator — see `references/pulse-features.md` if pulse data is also available.

----

Copyright 2026 The MathWorks, Inc.

----
