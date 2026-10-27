function report = verifySingleSegment(data, kind, opts)
%verifySingleSegment Preflight-check a single charge or discharge segment.
%   report = verifySingleSegment(data, kind) confirms that a single-segment
%   table matches the assumptions of the individual cycling functions
%   (batteryMeasurementFeatures, batteryDifferentialCurves) before those
%   functions are invoked.
%
%   Required Inputs:
%       data - Table of one segment (single charge or discharge)
%       kind - "CC", "single-phase", or "any"
%
%   Name-Value Arguments:
%       CurrentVariable    - Name of current column (default: "Current")
%       VoltageVariable    - Name of voltage column (default: "Voltage")
%       RSDCurrentCC       - RSD threshold below which current is flat
%                            (default 0.01)
%       RestCurrent        - |median(I)| below which segment is Rest
%                            (default 1e-4 A)
%
%   Output:
%       report - struct with fields:
%           .Kind    - the requested kind
%           .Passed  - true iff the requested check(s) all passed
%           .Reasons - string array of failure descriptions (empty on pass)
%           .Metrics - struct with rsdI, medianI, monotonicV, signChanges

arguments
    data table
    kind (1,1) string {mustBeMember(kind, ["CC","single-phase","any"])}
    opts.CurrentVariable (1,1) string = "Current"
    opts.VoltageVariable (1,1) string = "Voltage"
    opts.RSDCurrentCC (1,1) double {mustBePositive} = 0.01
    opts.RestCurrent (1,1) double {mustBePositive} = 1e-4
end

I = data.(opts.CurrentVariable);
V = data.(opts.VoltageVariable);

metrics.medianI     = median(I);
metrics.rsdI        = std(I) / max(abs(metrics.medianI), eps);
metrics.monotonicV  = all(diff(V) >= 0) || all(diff(V) <= 0);
nonRestMask         = abs(I) >= opts.RestCurrent;
signI               = sign(I(nonRestMask));
if isempty(signI)
    metrics.signChanges = 0;
else
    metrics.signChanges = sum(abs(diff(signI)) > 0);
end

reasons = strings(0, 1);

if kind == "CC" || kind == "any"
    if abs(metrics.medianI) < opts.RestCurrent
        reasons(end+1, 1) = sprintf( ...
            "median current |%.2e A| below RestCurrent threshold — segment looks like rest, not CC", ...
            metrics.medianI);
    end
    if metrics.rsdI >= opts.RSDCurrentCC
        reasons(end+1, 1) = sprintf( ...
            "RSD of current %.3f exceeds threshold %.3f — current is not flat", ...
            metrics.rsdI, opts.RSDCurrentCC);
    end
    if ~metrics.monotonicV
        reasons(end+1, 1) = "voltage is not monotonic — CC segment must not reverse direction";
    end
end

if kind == "single-phase" || kind == "any"
    if metrics.signChanges > 0
        reasons(end+1, 1) = sprintf( ...
            "sign of current flips %d time(s) — segment contains both charge and discharge", ...
            metrics.signChanges);
    end
end

report.Kind = kind;
report.Passed = isempty(reasons);
report.Reasons = reasons;
report.Metrics = metrics;

end

% Copyright 2026 The MathWorks, Inc.
