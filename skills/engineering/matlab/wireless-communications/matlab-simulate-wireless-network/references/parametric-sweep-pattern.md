# Parametric Sweep Pattern

## Core Rule

The `wirelessNetworkSimulator` is a singleton. You MUST call `.init` at the top of every loop iteration to reset state. Without this, nodes, connections, and traffic from prior iterations persist.

## Basic Sweep

```matlab
params = [10, 20, 30];
results = zeros(1, numel(params));

for idx = 1:numel(params)
    sim = wirelessNetworkSimulator.init;  % Reset simulator each iteration

    % Create nodes (technology-specific)
    % Configure connections (technology-specific)
    % Add traffic
    % addNodes(sim, nodes)

    run(sim, 0.5);

    % Extract results (technology-specific KPI or statistics)
    results(idx) = extractMetric(nodes);
end
```

## Multi-Dimensional Sweep

For sweeps over 2+ parameters, use nested loops with `.init` in the innermost:

```matlab
paramA = [0.01, 0.02];
paramB = [0, 5, 10];
results = zeros(numel(paramA), numel(paramB));

for i = 1:numel(paramA)
    for j = 1:numel(paramB)
        sim = wirelessNetworkSimulator.init;

        % Create and configure nodes using paramA(i) and paramB(j)
        % Add traffic
        % addNodes(sim, nodes)

        run(sim, 0.3);

        results(i,j) = extractMetric(nodes);
    end
end
```

## Parallel Sweeps with parfor

For independent iterations, use `parfor` to parallelize:

```matlab
params = [0.0075, 0.01, 0.015, 0.02, 0.03, 0.04];
results = zeros(1, numel(params));

parfor idx = 1:numel(params)
    sim = wirelessNetworkSimulator.init;

    % Full setup inside parfor body — each worker independent
    % Create nodes, configure, add traffic, addNodes

    run(sim, 0.5);

    results(idx) = extractMetric(nodes);
end
```

Requirements for `parfor`:
- Each iteration must be fully independent
- Parallel Computing Toolbox required
- Simulator reinit is mandatory (each worker gets its own singleton)
- Visualization tools (`wirelessTrafficViewer`) cannot be used inside `parfor`

## Key Rules

- `.init` must be **first** inside the loop (before node creation)
- Each iteration must recreate all nodes/connections (singleton resets everything)
- `parfor` cannot use visualization tools (`wirelessTrafficViewer`)

<!-- Copyright 2026 The MathWorks, Inc. -->
