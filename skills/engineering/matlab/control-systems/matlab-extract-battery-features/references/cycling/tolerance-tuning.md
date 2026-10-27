# Cycling: Tune Tolerance (Route A, on Phase 4 failure)

Load this in addition to `references/cycling-pipeline.md` only when `verifySegmentation` returns `TuningRecommended == true`. For a user-provided schedule, use `references/cycling/schedule-verification.md` instead. Skip this file entirely when the user has already fixed Tolerance in an earlier turn and the current call is a re-run.

## Phase 5 — Log-scale Tolerance sweep

Load `references/parameter-tuning.md` and run the log-scale Tolerance sweep described there (§ Tolerance Log-Scale Sweep). Pick the largest Tolerance value that drops `TuningRecommended` back to `false`, apply it (`parser.Tolerance = <value>`), re-segment, and re-verify:

```matlab
tolCandidates = [5e-5, 1e-5, 5e-6, 1e-6, 5e-7, 1e-7];
for t = tolCandidates
    parser.Tolerance = t;                  % invalidates cached segmentation
    report = verifySegmentation(parser);
    if ~report.TuningRecommended           % largest passing value wins
        break;
    end
end
segmented = segmentData(parser);           % re-segment with the chosen Tolerance
```

Report the chosen value as "tuned from Phase 5 sweep" in the Phase 7 summary, then continue with Phase 4b in `references/cycling-pipeline.md`.

### Sweep has no effect — check for tester-inserted artifact steps first

If `MismatchFraction` is identical at every Tolerance, inspect `MismatchGroups` before stopping. When every mismatch is a **tester-inserted artifact step** (1-3 samples per cycle between stages), no Tolerance can classify it: `segmentData` correctly leaves it `Undefined` and it contributes no features. This is a benign verifier finding, not a mis-set Tolerance. Keep the default Tolerance, continue with Phase 4b, extract, and name the artifact steps in the Phase 7 report.

### STOP: still recommends tuning after sweeping

**Still `TuningRecommended == true` after sweeping down to 1e-7, with mismatches on substantive steps** → STOP. Present the `MismatchGroups` table, the achieved `MismatchFraction`, the tried Tolerance values, and the `DiagnosticDt`. The data may be pre-averaged or the chemistry may need a different classifier — ask the user before proceeding with a Tolerance choice.

## IC / DV / DT smoothing

If curves look noisy or peaks look flattened, tune the differential-curve smoothing parameters — see `references/parameter-tuning.md` § Differential Curve Parameters.

----

Copyright 2026 The MathWorks, Inc.

----
