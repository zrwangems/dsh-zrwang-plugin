# Memory Optimization Patterns

MATLAB-specific memory patterns to apply after profiling identifies hotspots (Step 3).

## Cell Collection + vertcat (O(N) vs O(N²))

Growing arrays with `[arr; chunk]` copies the entire array each iteration.

```matlab
% Before: O(N²) reallocation
waveform = [];
for i = 1:numSegments
    waveform = [waveform; generateSegment(i)];
end

% After: O(N) — single allocation at the end
chunks = cell(numSegments, 1);
for i = 1:numSegments
    chunks{i} = generateSegment(i);
end
waveform = vertcat(chunks{:});
```

## Direct Allocation with zeros(...,'like',x)

Replace patterns that create zeros through multiplication.

```matlab
% Before: allocates + multiplies
result = 0 * x;

% After: direct allocation
result = zeros(size(x), 'like', x);
```

## Copy-on-Write Sharing

MATLAB shares memory between variables until one is modified. Exploit for read-only data.

```matlab
% Before: 4 allocations
coeffUpper = eye(N);
coeffLower = eye(N);

% After: shared via COW (1 allocation, shared until modified)
I = eye(N);
coeffUpper = I;
coeffLower = I;
```

## Implicit Expansion Instead of repmat

MATLAB R2016b+ broadcasts dimensions automatically — no need for `repmat`.

```matlab
% Before: explicit replicated array
B = repmat(meanVec, [nRows 1]);
centered = data - B;

% After: implicit expansion — no extra copy
centered = data - meanVec;
```

## max/min Instead of Logical Masking

The pattern `x .* (x > 0)` creates a temporary logical array the same size as `x`.

```matlab
% Before: temporary logical array
y = x .* (x > 0);

% After: no temporary
y = max(x, 0);
```

Copyright 2026 The MathWorks, Inc.
