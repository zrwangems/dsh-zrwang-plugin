# Cycling Postprocessing — Visualization & Feature Ranking

Load this when the user picks **Visualize** or **Rank features** as a next step after cycling feature extraction (see `references/cycling-pipeline.md` Phase 7). Nothing here runs before the feature table is extracted and reported.

## Visualization Options

Offer the plot type that matches what was extracted; roll each with base MATLAB (no skill-owned plot helpers ship on this branch):

| Plot type | Shows | Offer when | One-liner |
|-----------|-------|------------|-----------|
| **Segmented data** | V + I for one cycle, colored by CyclingMode (CC/CV/Rest) | Always — validates segmentation | `gscatter(time, voltage, segmented.CyclingModes)` (or two-panel `tiledlayout` for V and I) |
| **IC/DV/DT curves across cycles** | Overlaid differential curves at regular cycle intervals | When IC/DV/DT extracted | loop `computeDifferentialCurves` across selected cycles, overlay in `tiledlayout` colored by cycle |
| **Feature trends over cycles** | Selected features vs cycle number | Always — degradation trajectory | `tiledlayout` grid, one tile per feature: `plot(featureTable.(cycleVar), featureTable.(name))` |
| **Single feature trend** | One feature vs cycle with trend line | User asks about a specific feature | `plot` + `lsline` |

## Feature Ranking (correlation-based)

When the user has a target variable (capacity, SOH, or cycle number as an age proxy):

```matlab
targetVar = "Discharge_CycleCumulative_capacity";   % or user-specified
cycleVar  = parser.CycleIndexVariable;
featureCols = featureTable(:, ~ismember(featureTable.Properties.VariableNames, {targetVar, cycleVar}));

% Drop NaN/constant columns, then correlate with the target
validCols = varfun(@(x) ~all(isnan(x)) & std(x,'omitnan')>0, featureCols, OutputFormat="uniform");
featureCols = featureCols(:, validCols);
corrValues = corr(table2array(featureCols), featureTable.(targetVar), Rows="complete");
[~, sortIdx] = sort(abs(corrValues), 'descend');
rankedNames = featureCols.Properties.VariableNames(sortIdx);   % present top-10
```

After presenting the top-N, explain the physical meaning of the leading features using `references/cycling/feature-selection.md`, and compare the ranked list against that file's *expected* top features: agreement means the ranking has physical grounding; a list dominated by "watch for noise" entries means too few cycles, over-smoothing, or a spurious trend.

----

Copyright 2026 The MathWorks, Inc.

----
