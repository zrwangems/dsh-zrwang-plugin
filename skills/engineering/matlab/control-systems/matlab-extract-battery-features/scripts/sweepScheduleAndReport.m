function out = sweepScheduleAndReport(tbl, schedule, mapping, tolGrid)
%sweepScheduleAndReport Sweep Tolerance, classify cycles, and report.
%   out = sweepScheduleAndReport(tbl, schedule, mapping, tolGrid) runs
%   verifyAgainstSchedule at each Tolerance in tolGrid and classifies each
%   cycle as neverPass, alwaysPass, or Tolerance-sensitive. Picks the
%   largest Tolerance that satisfies every Tolerance-sensitive cycle and
%   excludes neverPass cycles from downstream extraction.
%
%   Inputs:
%       tbl      - cycling data table
%       schedule - struct array (see verifyAgainstSchedule)
%       mapping  - struct with parser column mappings (see below)
%       tolGrid  - vector of Tolerance candidates, high → low
%
%   mapping fields (all required):
%       CurrentVariable, VoltageVariable, TimeVariable,
%       CycleIndexVariable, StepIndexVariable, TemperatureVariable

arguments
    tbl (:,:) table
    schedule (1,:) struct
    mapping (1,1) struct
    tolGrid (1,:) double = [5e-5, 1e-5, 1e-6]
end

parser = @(tol) batteryTestDataParser(tbl, ...
    CurrentVariable=mapping.CurrentVariable, ...
    VoltageVariable=mapping.VoltageVariable, ...
    TimeVariable=mapping.TimeVariable, ...
    CycleIndexVariable=mapping.CycleIndexVariable, ...
    StepIndexVariable=mapping.StepIndexVariable, ...
    TemperatureVariable=mapping.TemperatureVariable, ...
    Tolerance=tol);

cyc = unique(tbl.(mapping.CycleIndexVariable));
numCyc = numel(cyc);
passMap = false(numCyc, numel(tolGrid));
reports = cell(1, numel(tolGrid));

fprintf('Sweeping Tolerance over %d values on %d cycles...\n', numel(tolGrid), numCyc);
for i = 1:numel(tolGrid)
    p = parser(tolGrid(i));
    r = verifyAgainstSchedule(p, schedule);
    reports{i} = r;
    [~, ia, ib] = intersect(r.PerCycle.Cycle, cyc, 'stable');
    passMap(ib, i) = r.PerCycle.AllStepsPass(ia);
    fprintf('  Tol=%-8.0e  passed %d/%d cycles\n', tolGrid(i), sum(passMap(:,i)), numCyc);
end

alwaysPass    = all(passMap, 2);
neverPass     = ~any(passMap, 2);
tolSensitive  = ~alwaysPass & ~neverPass;

bestTol = NaN;
if any(tolSensitive)
    for i = 1:numel(tolGrid)
        if all(passMap(tolSensitive, i))
            bestTol = tolGrid(i);
            break
        end
    end
    if isnan(bestTol)
        [~, bi] = max(sum(passMap(tolSensitive, :), 1));
        bestTol = tolGrid(bi);
        fprintf('WARN: no single Tolerance satisfies every sensitive cycle. Picked best partial: %.0e\n', bestTol);
    end
else
    bestTol = tolGrid(1);   % nothing sensitive — largest value works
end

excludedCycles = cyc(neverPass);

% Final verify at bestTol
finalParser = parser(bestTol);
finalReport = verifyAgainstSchedule(finalParser, schedule);

fprintf('\n=== Sweep-and-classify report ===\n');
fprintf('Cycles:                    %d total\n', numCyc);
fprintf('  Always pass:             %d\n', sum(alwaysPass));
fprintf('  Tolerance-sensitive:     %d\n', sum(tolSensitive));
fprintf('  Never pass (data issue): %d  cycles: %s\n', sum(neverPass), mat2str(excludedCycles'));
fprintf('Selected Tolerance:        %.0e\n', bestTol);
fprintf('Final pass count @bestTol: %d/%d\n', finalReport.PassCount, numCyc);

if ~isempty(excludedCycles)
    fprintf('\nExcluded-cycle reasons (from bestTol verification):\n');
    for c = excludedCycles'
        row = finalReport.PerCycle(finalReport.PerCycle.Cycle==c, :);
        if ~isempty(row)
            fprintf('  Cycle %d: %s\n', c, row.FirstFailReason);
        end
    end
end

out.PassMap = passMap;
out.TolGrid = tolGrid;
out.BestTol = bestTol;
out.ExcludedCycles = excludedCycles;
out.AlwaysPass = cyc(alwaysPass);
out.TolSensitive = cyc(tolSensitive);
out.FinalReport = finalReport;
out.PerToleranceReports = reports;
end

% Copyright 2026 The MathWorks, Inc.
