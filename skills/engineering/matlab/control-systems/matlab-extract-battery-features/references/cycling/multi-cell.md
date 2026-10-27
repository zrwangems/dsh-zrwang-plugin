# Cycling: Multiple Files and Multiple Battery Cells

Load this in addition to `references/cycling-pipeline.md` when the cycling data spans **more than one file** for a battery cell, or covers **more than one battery cell** (a `CellID` / `Cell` / `SerialNumber` column, one file per battery cell, or a MATLAB cell array of per-battery-cell tables). It replaces the single-battery-cell parts of Phase 2, Phase 6, and Phase 7; every other phase is unchanged.

## Phase 2 — Data Layout

For cycling the rule is **combine before parsing**.

### Layout 2 — One battery cell, multiple files (or MATLAB cell array of tables from one battery cell)

Concatenate into a single table. If each source's cycle index restarts from 1, **offset before concatenation** so the combined cycle index is monotonic:

```matlab
files = dir(fullfile(dataDir, "*.csv"));
allTables = cell(numel(files), 1);
cycleOffset = 0;
for k = 1:numel(files)
    t = readtable(fullfile(files(k).folder, files(k).name));
    t.Cycle_Index = t.Cycle_Index + cycleOffset;
    cycleOffset = max(t.Cycle_Index);
    allTables{k} = t;
end
cyclingData = vertcat(allTables{:});
```

Then a single pipeline call on `cyclingData` — continue with Phase 3 in `references/cycling-pipeline.md`.

### Layout 3 — Multiple battery cells (any storage form)

Combine into one table carrying a `CellID` column. Cycle indices do **not** need to be globally unique — the pipeline processes each battery cell separately in Phase 6, so within-battery-cell cycle numbering is what matters.

```matlab
% Example: separate files → combined table with CellID derived from filename
files = dir(fullfile(dataDir, "*.csv"));
allTables = cell(numel(files), 1);
for k = 1:numel(files)
    t = readtable(fullfile(files(k).folder, files(k).name));
    t.CellID = repmat(string(erase(files(k).name, ".csv")), height(t), 1);
    allTables{k} = t;
end
cyclingData = vertcat(allTables{:});
```

Variants:
- Data is already a **MATLAB cell array of tables**, one element per battery cell → tag each element's `CellID`, then `vertcat`.
- Data is already a **single combined table** with `CellID` (or `Cell`, `SerialNumber`) → no preprocessing.

The `CellID` column is a separate tag — do not pass it to the parser.

**Report the detected layout** in the Phase 7 summary so the user knows how the output is organized.

## Phase 6 — Feature extraction, multiple battery cells

**Do not `vertcat` across battery cells.** Loop Phases 3-6 per battery cell and keep each per-battery-cell feature table in its own cell-array element. Different battery cells may have different `RecommendedPhase`, different `AnomalousCycles`, and cycle indices that restart per battery cell — pooling upfront hides those differences.

```matlab
cellIDs = unique(cyclingData.CellID, "stable");
featuresPerCell = cell(numel(cellIDs), 1);
recommendedPhases = strings(numel(cellIDs), 1);
for k = 1:numel(cellIDs)
    thisCellData = cyclingData(cyclingData.CellID == cellIDs(k), :);
    parser = batteryTestDataParser(thisCellData, ...
        CurrentVariable="Current", VoltageVariable="Voltage", ...
        TimeVariable="DateTime", CycleIndexVariable="Cycle_Index", ...
        StepIndexVariable="Step_Index", TemperatureVariable="Temperature");
    verifyReport = verifySegmentation(parser);
    % If verifyReport.TuningRecommended, run the Phase 5 Tolerance sweep before proceeding.
    % Different cells at the same sampling rate typically need the same Tolerance value.
    result = checkCyclingProtocol(parser);
    % STOP per battery cell if result flags anomalous cycles or no consistent phase.
    recommendedPhases(k) = result.RecommendedPhase;
    extractor = batteryTestFeatureExtractor( ...
        CyclingPhase=result.RecommendedPhase, IC=true, ...
        CycleCumulative=true, Statistics=true, CC=true, CV=true, CCCV=true);
    ft = extract(extractor, parser);
    ft.CellID = repmat(cellIDs(k), height(ft), 1);
    featuresPerCell{k} = ft;
end
```

- `featuresPerCell{k}` = feature table for battery cell `cellIDs(k)`.
- Each per-battery-cell table carries a `CellID` column and preserves its own cycle-index axis.
- Surface (not silently skip) two cases: a battery cell whose `checkCyclingProtocol` returns no consistent phase (ask the user whether to drop it or hand-pick its phase), and a battery cell whose `RecommendedPhase` differs from the majority (proceed but flag it in the Phase 7 report so cross-battery-cell trends are comparable).

## Phase 7 — Report, multiple battery cells

Use this in place of the single-battery-cell report, keeping the same Key decisions and Data quality lines:

> Extracted features from **K battery cells** over up to **M cycles per battery cell**.
> - Per-battery-cell feature tables held in a MATLAB cell array: `featuresPerCell{k}` for battery cell k.
> - Each row = one cycle. Tag column: `CellID`; cycle index preserved from the source.
> - `RecommendedPhase` per battery cell: <list, flag any outliers>.
> - Cross-battery-cell ranking iterates over `featuresPerCell` — see `references/cycling/feature-selection.md` (Cell Screening row).

Then stop and offer the standing next steps exactly as in `references/cycling-pipeline.md` Phase 7.

----

Copyright 2026 The MathWorks, Inc.

----
