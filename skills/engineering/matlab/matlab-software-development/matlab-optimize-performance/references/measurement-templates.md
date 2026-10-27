# Measurement Templates

Ready-to-use MATLAB script templates for each step of the performance optimization workflow.

## Template 1: Baseline Measurement (timeit)

```matlab
% baseline_measure.m
% Measures baseline performance of a target function

% Setup — NOT timed
rng('default');
data = rand(1e6, 1);  % adjust to realistic input size

% Define function handle
f = @() targetFunction(data);

% Warmup is handled by timeit automatically
baseline = timeit(f);
fprintf('Baseline: %.6f s\n', baseline);

% Save for later comparison
save('baseline.mat', 'baseline');
```

## Template 2: Profiling

```matlab
% profile_target.m
% Profile to find where time is spent

% Setup
rng('default');
data = rand(1e6, 1);

% Run multiple iterations for stable profiling
profile on;
for iter = 1:10
    targetFunction(data);
end
profile off;

% Display results sorted by self-time
p = profile('info');
ft = p.FunctionTable;

% Compute self-time (not stored directly — subtract children's time)
nFuncs = numel(ft);
selfTime = zeros(nFuncs, 1);
for i = 1:nFuncs
    if ~isempty(ft(i).Children)
        selfTime(i) = ft(i).TotalTime - sum([ft(i).Children.TotalTime]);
    else
        selfTime(i) = ft(i).TotalTime;
    end
end

[~, idx] = sort(selfTime, 'descend');
fprintf('%-50s %10s %10s %10s\n', 'Function', 'TotalTime', 'SelfTime', 'Calls');
fprintf('%s\n', repmat('-', 1, 82));
for i = 1:min(20, numel(idx))
    fprintf('%-50s %10.4f %10.4f %10d\n', ...
        ft(idx(i)).FunctionName, ft(idx(i)).TotalTime, selfTime(idx(i)), ft(idx(i)).NumCalls);
end

% Open interactive viewer
profile viewer;
```

## Template 3: Before/After Comparison

```matlab
% compare_performance.m
% Compare original vs optimized function

% Setup (same inputs for both)
rng('default');
data = rand(1e6, 1);

% Measure original
fOrig = @() originalFunction(data);
tOrig = timeit(fOrig);

% Measure optimized
fOpt = @() optimizedFunction(data);
tOpt = timeit(fOpt);

% Report
speedup = tOrig / tOpt;
fprintf('Original:  %.6f s\n', tOrig);
fprintf('Optimized: %.6f s\n', tOpt);
fprintf('Speedup:   %.2fx\n', speedup);

% Verify correctness
resultOrig = originalFunction(data);
resultOpt = optimizedFunction(data);
maxErr = max(abs(resultOrig(:) - resultOpt(:)));
fprintf('Max error: %.2e\n', maxErr);
assert(maxErr < 1e-10, 'Results differ!');
```

## Template 4: GPU Timing

```matlab
% gpu_timing.m
% Properly time GPU operations

dev = gpuDevice;
gpuData = gpuArray(rand(1e6, 1));

% Use gputimeit (preferred — handles sync and warmup)
f = @() myGpuFunction(gpuData);
t = gputimeit(f);
fprintf('GPU time (gputimeit): %.6f s\n', t);

% Manual timing (when gputimeit isn't suitable)
% Warmup
for w = 1:5
    wait(dev);
    myGpuFunction(gpuData);
    wait(dev);
end

% Measure
nRuns = 20;
times = zeros(1, nRuns);
for i = 1:nRuns
    wait(dev);
    tic;
    myGpuFunction(gpuData);
    wait(dev);  % CRITICAL: sync before reading timer
    times(i) = toc;
end
fprintf('GPU time (manual): %.6f s (median of %d runs)\n', median(times), nRuns);
```

## Template 5: Scaling Test

```matlab
% scaling_test.m
% Test how performance scales with input size

sizes = [1e3, 1e4, 1e5, 1e6, 1e7];
times = zeros(size(sizes));

for k = 1:numel(sizes)
    data = rand(sizes(k), 1);
    f = @() targetFunction(data);
    times(k) = timeit(f);
end

% Plot scaling behavior
figure;
loglog(sizes, times, '-o', 'LineWidth', 2);
xlabel('Input size (N)');
ylabel('Time (s)');
title('Performance Scaling');
grid on;

% Check scaling order
slopes = diff(log(times)) ./ diff(log(sizes));
fprintf('Estimated scaling exponents: %s\n', mat2str(slopes, 2));
fprintf('(1.0 = linear, 2.0 = quadratic)\n');
```

Copyright 2026 The MathWorks, Inc.
