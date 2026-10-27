# Multi-Net Batch PDN Analysis

Analyze all power rails on a board in one pass. Resolve parameters once, then iterate.

## Full Batch Loop

```matlab
%% Step 1: Import and discover power nets
pcb = pcbFileRead(fullfile(boardDir, 'server_mainboard'));
netList = cadnetList(pcb);

% Filter to power nets using naming conventions
powerPatterns = ["^P\d+V", "^VDD", "^VCC", "^AVDD", "^DVDD"];
isPower = false(height(netList), 1);
for p = powerPatterns
    isPower = isPower | ~cellfun(@isempty, regexpi(netList.CadnetName, p));
end
powerNets = sortrows(netList(isPower & netList.NumPins >= 5, :), 'NumPins', 'descend');

%% Step 2: Set global defaults
globalLoadCurrent = 1;          % A (override per-rail as needed)
globalMaxCurrentDensity = 0.5;  % A/mm^2
globalMaxViaCurrent = 1;        % A

%% Step 3: Iterate over rails
for k = 1:height(powerNets)
    netName = powerNets.CadnetName{k};
    nomV = parseNetVoltage(netName);

    % Skip rails with unknown voltage
    if isnan(nomV)
        fprintf('SKIP: %s — voltage unknown\n', netName);
        continue;
    end

    cnet = cadnet(pcb, netName);
    inductors = findComponents(cnet, "ComponentType", "Inductor");
    ics = findComponents(cnet, "ComponentType", "IC");

    % Skip rails with no source or load
    if isempty(inductors) || isempty(ics)
        fprintf('SKIP: %s — missing source or load\n', netName);
        continue;
    end

    % Resolve sense component (required)
    tp = findComponents(cnet, 'ComponentType', 'Test Point');
    if ~isempty(tp)
        senseRef = tp.Refdes;
    else
        resistors = findComponents(cnet, 'ComponentType', 'Resistor');
        if isempty(resistors)
            fprintf('SKIP: %s — no sense component\n', netName);
            continue;
        end
        senseRef = resistors.Refdes(1);
    end

    PDN = powerDistributionNetwork(cnet);
    setNetworkParameters(PDN, ...
        Source=inductors.Refdes, ...
        Load=ics.Refdes, ...
        Sense=senseRef, ...
        PlatingThickness=35e-6);
    setDCParameters(PDN, "NominalVoltage", nomV, ...
        "LoadCurrent", globalLoadCurrent);
    setDCRules(PDN, ...
        "MaxCurrentDensity", globalMaxCurrentDensity, ...
        "MaxVoltage", nomV * 1.1, ...
        "MinVoltage", nomV * 0.9, ...
        "MaxViaCurrent", globalMaxViaCurrent);

    % Run analysis
    figure('Name', netName);
    voltage(PDN, ShowViolation=true);
    title(sprintf('%s — Voltage Distribution', netName));

    fprintf('DONE: %s (%.2fV, %.1fA)\n', netName, nomV, globalLoadCurrent);
end
```

## Per-Rail Parameter Overrides

For per-rail parameter overrides, provide a spec table:

```matlab
% Rail spec table — fill in per-rail parameters
railSpec = table( ...
    ["P0V8"; "P3V3"; "P1V8"; "P12V"], ...
    [0.8; 3.3; 1.8; 12.0], ...
    [10; 2; 5; 1], ...
    'VariableNames', ["NetName", "NominalVoltage", "LoadCurrent"]);

for k = 1:height(railSpec)
    cnet = cadnet(pcb, railSpec.NetName(k));
    PDN = powerDistributionNetwork(cnet);
    setNetworkParameters(PDN, AutoAssignDefault='True');
    setDCParameters(PDN, "NominalVoltage", railSpec.NominalVoltage(k), ...
        "LoadCurrent", railSpec.LoadCurrent(k));
    setDCRules(PDN, ...
        "MaxCurrentDensity", 0.5, ...
        "MaxVoltage", railSpec.NominalVoltage(k) * 1.1, ...
        "MinVoltage", railSpec.NominalVoltage(k) * 0.9, ...
        "MaxViaCurrent", 1);
    voltage(PDN, ShowViolation=true);
end
```

## parseNetVoltage Helper Function

Include this at the end of your script or as a local function:

```matlab
function nomV = parseNetVoltage(netName)
    netName = string(netName);
    % P<int>V<frac> pattern (P0V8 → 0.8, P3V3 → 3.3, P12V → 12.0)
    tok = regexp(netName, '(?i)P(\d+)V(\d*)', 'tokens');
    if ~isempty(tok)
        intPart = str2double(tok{1}{1});
        fracStr = tok{1}{2};
        if isempty(fracStr)
            nomV = intPart;
        else
            nomV = intPart + str2double(fracStr) / 10^numel(fracStr);
        end
        return;
    end
    % Explicit decimal (3.3V, 1.8V)
    tok = regexp(netName, '(\d+\.\d+)\s*V', 'tokens');
    if ~isempty(tok)
        nomV = str2double(tok{1}{1});
        return;
    end
    % Millivolt (800MV → 0.8)
    tok = regexp(netName, '(\d+)\s*MV', 'tokens', 'ignorecase');
    if ~isempty(tok)
        nomV = str2double(tok{1}{1}) / 1000;
        return;
    end
    nomV = NaN;
end
```

----

Copyright 2026 The MathWorks, Inc.
