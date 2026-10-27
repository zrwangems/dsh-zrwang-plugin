function report = verifySegmentation(parser, opts)
%verifySegmentation Cross-check segmentData output against raw signature.
%   report = verifySegmentation(parser) segments the data using the given
%   batteryTestDataParser, then compares the CC/CV/Rest classification per
%   (cycle, step) group against an independent raw-signal signature computed
%   directly from the current and voltage traces. Groups whose expected
%   mode disagrees with the observed classification are surfaced so the
%   caller can decide whether to tune Tolerance before extracting features.
%
%   Required Input:
%       parser - batteryTestDataParser object (already configured with
%                column mappings)
%
%   Name-Value Arguments:
%       RSDCurrentCC     - std(I)/|median(I)| below which a group is a
%                          pure-CC candidate (default 0.01).
%       RestCurrent      - |median(I)| below which a group is considered
%                          Rest (default 1e-4 A).
%       MinCCFraction    - Minimum fraction of samples classified CC by
%                          segmentData needed to accept a CC-signature
%                          group as correctly segmented (default 0.9).
%       MinMismatchFraction - Fraction of (Cycle, Step) groups that may
%                          mismatch before TuningRecommended fires
%                          (default 0.02, i.e. 2%). Sporadic outlier
%                          cycles below this fraction typically indicate
%                          per-cycle data artifacts rather than a
%                          systematic Tolerance mis-set.
%
%   Output:
%       report - struct with fields:
%           .RawSignatureTable - per (Cycle, Step) group: rsdI, medI, and
%                                the expected mode from raw signals.
%           .SegmentationTable - per (Cycle, Step) group: fractions of
%                                samples labeled CC, CV, Rest by segmentData.
%           .MismatchCount     - number of groups whose expected mode
%                                disagrees with the observed classification.
%           .MismatchFraction  - MismatchCount / total groups.
%           .MismatchGroups    - table with (Cycle, Step, Expected,
%                                ObservedPctCC, ObservedPctCV,
%                                ObservedPctRest, Reason).
%           .TuningRecommended - true when MismatchFraction > MinMismatchFraction.
%           .DiagnosticDt      - median inter-sample dt in seconds.

arguments
    % Accept the object returned by the public batteryTestDataParser factory.
    % No class constraint: that constructor returns an object whose only class
    % name is internal (predmaint.internal.battery.BatteryTestDataParser), and
    % naming an internal class in shipped code is brittle across PMT releases.
    parser (1,1)
    opts.RSDCurrentCC (1,1) double {mustBePositive} = 0.01
    opts.RestCurrent (1,1) double {mustBePositive} = 1e-4
    opts.MinCCFraction (1,1) double {mustBeNonnegative, mustBeLessThanOrEqual(opts.MinCCFraction,1)} = 0.9
    opts.MinMismatchFraction (1,1) double {mustBeNonnegative, mustBeLessThanOrEqual(opts.MinMismatchFraction,1)} = 0.02
end

cycleVar = parser.CycleIndexVariable;
stepVar  = parser.StepIndexVariable;
currVar  = parser.CurrentVariable;
timeVar  = parser.TimeVariable;

segmented = segmentData(parser);

% Sampling-rate diagnostic
tCol = segmented.(timeVar);
if isdatetime(tCol) || isduration(tCol)
    dts = seconds(diff(tCol));
else
    dts = diff(tCol);
end
diagnosticDt = median(dts, "omitnan");

groupKeys = unique(segmented(:, [cycleVar, stepVar]), "rows");
numGroups = height(groupKeys);

rawRows = struct([]);
segRows = struct([]);
mismatchRows = struct([]);

for k = 1:numGroups
    cyc = groupKeys.(cycleVar)(k);
    stp = groupKeys.(stepVar)(k);
    mask = segmented.(cycleVar) == cyc & segmented.(stepVar) == stp;
    sub  = segmented(mask, :);

    I = sub.(currVar);
    medI = median(I);
    rsdI = std(I) / max(abs(medI), eps);

    if abs(medI) < opts.RestCurrent
        expected = "Rest";
    elseif rsdI < opts.RSDCurrentCC
        expected = "CC";
    else
        expected = "Undefined";
    end

    modes = string(sub.CyclingModes);
    n = numel(modes);
    pctCC   = 100 * sum(modes == "CC")   / n;
    pctCV   = 100 * sum(modes == "CV")   / n;
    pctRest = 100 * sum(modes == "Rest") / n;

    rawRows(end+1).Cycle = cyc; %#ok<AGROW>
    rawRows(end).Step = stp;
    rawRows(end).MedianCurrent_A = round(medI, 4);
    rawRows(end).RSD_Current = round(rsdI, 5);
    rawRows(end).Expected = expected;

    segRows(end+1).Cycle = cyc; %#ok<AGROW>
    segRows(end).Step = stp;
    segRows(end).CC_Pct = round(pctCC, 1);
    segRows(end).CV_Pct = round(pctCV, 1);
    segRows(end).Rest_Pct = round(pctRest, 1);

    reason = "";
    isMismatch = false;
    if expected == "CC" && pctCC < 100*opts.MinCCFraction
        isMismatch = true;
        reason = sprintf("expected CC (RSD=%.4f), observed %.0f%% CC", ...
            rsdI, pctCC);
    elseif expected == "Rest" && pctRest < 100*opts.MinCCFraction
        isMismatch = true;
        reason = sprintf("expected Rest (|medI|=%.2e A), observed %.0f%% Rest", ...
            abs(medI), pctRest);
    end

    if isMismatch
        mismatchRows(end+1).Cycle = cyc; %#ok<AGROW>
        mismatchRows(end).Step = stp;
        mismatchRows(end).Expected = expected;
        mismatchRows(end).ObservedPctCC = round(pctCC, 1);
        mismatchRows(end).ObservedPctCV = round(pctCV, 1);
        mismatchRows(end).ObservedPctRest = round(pctRest, 1);
        mismatchRows(end).Reason = string(reason);
    end
end

report.RawSignatureTable = struct2table(rawRows, AsArray=true);
report.SegmentationTable = struct2table(segRows, AsArray=true);
if isempty(mismatchRows)
    report.MismatchGroups = table('Size', [0 7], ...
        'VariableTypes', ["double","double","string","double","double","double","string"], ...
        'VariableNames', ["Cycle","Step","Expected","ObservedPctCC", ...
                          "ObservedPctCV","ObservedPctRest","Reason"]);
else
    report.MismatchGroups = struct2table(mismatchRows, AsArray=true);
end
report.MismatchCount = height(report.MismatchGroups);
report.MismatchFraction = report.MismatchCount / max(numGroups, 1);
report.TuningRecommended = report.MismatchFraction > opts.MinMismatchFraction;
report.DiagnosticDt = diagnosticDt;

end

% Copyright 2026 The MathWorks, Inc.
