function report = verifyAgainstSchedule(parser, schedule)
%verifyAgainstSchedule Verify segmentation against a user-provided schedule.
%   report = verifyAgainstSchedule(parser, schedule) segments the parser
%   data and checks each (Cycle, Step) group against the declared schedule.
%   Complements verifySegmentation for the case where the tester schedule
%   is known and can be asserted directly.
%
%   Inputs:
%       parser   - configured batteryTestDataParser
%       schedule - struct array; one entry per Step_Index with fields:
%           .Step              - integer Step_Index
%           .Type              - "CC" | "CV" | "Rest" | "CCCV"
%           .MinCoverage       - (CC/CV/Rest) fraction of samples that must
%                                match Type. Default: 0.85 for CC/CV, 0.95 for Rest
%           .MinCC             - (CCCV) minimum CC-labeled fraction. Default 0.05
%           .MinCV             - (CCCV) minimum CV-labeled fraction. Default 0.05
%           .TransitionVoltage - (CCCV, optional) declared CC→CV transition V
%           .TransitionTol     - (CCCV) tolerance on TransitionVoltage. Default 0.05
%           .MaxUndefinedFrac  - Max Undefined fraction allowed. Default 0.15
%           .MinSamples        - Minimum sample count; below this the step is
%                                marked as data-collection failure. Default 5
%
%   Output:
%       report.PerGroup   - table: (Cycle, Step, Expected, Coverage, TransitionV,
%                            Pass, Reason, N)
%       report.PerCycle   - table: (Cycle, AllStepsPass, NumFail, FirstFailReason)
%       report.PassCount  - number of cycles that passed all steps
%       report.NumCycles  - total cycles
%       report.AgingSignals - table: (Cycle, plus per-CCCV-step: TransitionV,
%                             CCFrac, CVFrac, TaperDuration)

arguments
    % No class constraint on parser: the public batteryTestDataParser factory
    % returns an object whose only class name is internal
    % (predmaint.internal.battery.BatteryTestDataParser); naming it in shipped
    % code is brittle across PMT releases.
    parser (1,1)
    schedule (1,:) struct
end

cycleVar = parser.CycleIndexVariable;
stepVar  = parser.StepIndexVariable;
voltVar  = parser.VoltageVariable;
timeVar  = parser.TimeVariable;

seg = segmentData(parser);
cycles = unique(seg.(cycleVar));

perGroup = {};
agingRows = {};

for ci = 1:numel(cycles)
    cyc = cycles(ci);
    ageRow = struct('Cycle', cyc);
    for k = 1:numel(schedule)
        entry = schedule(k);
        entry = fillDefaults(entry);

        mask = seg.(cycleVar) == cyc & seg.(stepVar) == entry.Step;
        n    = sum(mask);
        if n < entry.MinSamples
            perGroup(end+1,:) = {cyc, entry.Step, entry.Type, 0, NaN, false, ...
                sprintf("data-collection: only %d samples (< %d)", n, entry.MinSamples), n}; %#ok<AGROW>
            continue
        end

        rows = seg(mask, :);
        modes = string(rows.CyclingModes);
        V = rows.(voltVar);
        t = rows.(timeVar);

        switch entry.Type
            case {"CC","CV","Rest"}
                cov = mean(modes == entry.Type);
                pass = cov >= entry.MinCoverage;
                reason = "OK";
                if ~pass
                    dominant = modeDominant(modes);
                    reason = sprintf("expected %s coverage >= %.2f, got %.2f (dominant: %s)", ...
                        entry.Type, entry.MinCoverage, cov, dominant);
                end
                perGroup(end+1,:) = {cyc, entry.Step, entry.Type, cov, NaN, pass, reason, n}; %#ok<AGROW>

            case "CCCV"
                nCC = sum(modes == "CC");
                nCV = sum(modes == "CV");
                nRest = sum(modes == "Rest");
                nUnd = sum(modes == "Undefined");
                total = n;

                ccFrac = nCC / total;
                cvFrac = nCV / total;
                undFrac = nUnd / total;

                hasCC = ccFrac >= entry.MinCC;
                hasCV = cvFrac >= entry.MinCV;
                noRest = nRest == 0;
                undOK  = undFrac <= entry.MaxUndefinedFrac;

                % Order: median t of CC < median t of CV
                if hasCC && hasCV
                    tSec = elapsed(t);
                    tCCmed = median(tSec(modes == "CC"));
                    tCVmed = median(tSec(modes == "CV"));
                    orderOK = tCCmed < tCVmed;
                    % Transition voltage = voltage at last CC sample
                    lastCC = find(modes == "CC", 1, "last");
                    vTransition = V(lastCC);
                else
                    orderOK = false;
                    vTransition = NaN;
                end

                if isfield(entry, 'TransitionVoltage') && ~isnan(entry.TransitionVoltage) && ~isnan(vTransition)
                    transOK = abs(vTransition - entry.TransitionVoltage) <= entry.TransitionTol;
                else
                    transOK = true;
                end

                pass = hasCC && hasCV && noRest && undOK && orderOK && transOK;
                reason = "OK";
                if ~pass
                    reasons = strings(0);
                    if ~hasCC,    reasons(end+1) = sprintf("CC frac %.2f < %.2f", ccFrac, entry.MinCC); end
                    if ~hasCV,    reasons(end+1) = sprintf("CV frac %.2f < %.2f", cvFrac, entry.MinCV); end
                    if ~noRest,   reasons(end+1) = "Rest samples in composite step"; end
                    if ~undOK,    reasons(end+1) = sprintf("Undefined frac %.2f > %.2f", undFrac, entry.MaxUndefinedFrac); end
                    if hasCC && hasCV && ~orderOK, reasons(end+1) = "CV precedes CC"; end
                    if ~transOK,  reasons(end+1) = sprintf("V_transition %.3f off target %.3f", vTransition, entry.TransitionVoltage); end
                    reason = strjoin(reasons, "; ");
                end

                perGroup(end+1,:) = {cyc, entry.Step, entry.Type, ccFrac, vTransition, pass, reason, n}; %#ok<AGROW>

                % Aging signals from CCCV steps
                fld = sprintf("Step%d_TransV", entry.Step);
                ageRow.(fld) = vTransition;
                fld = sprintf("Step%d_CCFrac", entry.Step);
                ageRow.(fld) = ccFrac;
                fld = sprintf("Step%d_CVFrac", entry.Step);
                ageRow.(fld) = cvFrac;
                fld = sprintf("Step%d_TaperN", entry.Step);
                ageRow.(fld) = nCV;
        end
    end
    agingRows(end+1,:) = {ageRow}; %#ok<AGROW>
end

perGroupT = cell2table(perGroup, 'VariableNames', ...
    {'Cycle','Step','Expected','Coverage','TransitionV','Pass','Reason','N'});

% Per-cycle roll-up
cycUnique = unique(perGroupT.Cycle);
perCycle = table('Size',[numel(cycUnique),4], ...
    'VariableTypes',{'double','logical','double','string'}, ...
    'VariableNames',{'Cycle','AllStepsPass','NumFail','FirstFailReason'});
for i=1:numel(cycUnique)
    cyc = cycUnique(i);
    sub = perGroupT(perGroupT.Cycle==cyc, :);
    perCycle.Cycle(i) = cyc;
    perCycle.NumFail(i) = sum(~sub.Pass);
    perCycle.AllStepsPass(i) = all(sub.Pass);
    if perCycle.AllStepsPass(i)
        perCycle.FirstFailReason(i) = "";
    else
        firstFail = find(~sub.Pass, 1);
        perCycle.FirstFailReason(i) = sprintf("step %d: %s", sub.Step(firstFail), sub.Reason(firstFail));
    end
end

report.PerGroup = perGroupT;
report.PerCycle = perCycle;
report.PassCount = sum(perCycle.AllStepsPass);
report.NumCycles = height(perCycle);
report.AgingSignals = agingRows;
end

function entry = fillDefaults(entry)
if ~isfield(entry,'MinCoverage') || isempty(entry.MinCoverage)
    if entry.Type == "Rest"
        entry.MinCoverage = 0.95;
    else
        entry.MinCoverage = 0.85;
    end
end
if ~isfield(entry,'MinCC') || isempty(entry.MinCC),    entry.MinCC = 0.05; end
if ~isfield(entry,'MinCV') || isempty(entry.MinCV),    entry.MinCV = 0.05; end
if ~isfield(entry,'TransitionVoltage') || isempty(entry.TransitionVoltage), entry.TransitionVoltage = NaN; end
if ~isfield(entry,'TransitionTol') || isempty(entry.TransitionTol),         entry.TransitionTol = 0.05; end
if ~isfield(entry,'MaxUndefinedFrac') || isempty(entry.MaxUndefinedFrac),   entry.MaxUndefinedFrac = 0.15; end
if ~isfield(entry,'MinSamples') || isempty(entry.MinSamples),               entry.MinSamples = 5; end
end

function d = modeDominant(modes)
[u, ~, ic] = unique(modes);
counts = accumarray(ic, 1);
[~, idx] = max(counts);
d = u(idx);
end

function s = elapsed(t)
if isdatetime(t) || isduration(t)
    s = seconds(t - t(1));
else
    s = t - t(1);
end
end

% Copyright 2026 The MathWorks, Inc.
