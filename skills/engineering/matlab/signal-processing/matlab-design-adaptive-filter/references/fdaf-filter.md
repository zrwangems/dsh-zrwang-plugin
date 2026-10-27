# dsp.FrequencyDomainAdaptiveFilter

## When to use dsp.FrequencyDomainAdaptiveFilter

- Long filters (> 256 taps) — Time-domain LMS becomes computationally expensive
- Real-time block-based processing — Audio hardware buffers
- Echo cancellation with long room impulse responses — Handles 1000-8000 tap systems effectively
- Need both a long filter and low latency — Use partitioned mode to achieve both simultaneously

## Methods (4 variants)

| Method | Partitioned? | Constrained? | Use Case |
|--------|-------------|------------|----------|
| `'Constrained FDAF'` | No | Yes | Standard; prevents spectral leakage |
| `'Unconstrained FDAF'` | No | No | Slightly faster, may introduce spectral leakage |
| `'Partitioned constrained FDAF'` | **Yes** | Yes | **Long filters with low latency** |
| `'Partitioned unconstrained FDAF'` | **Yes** | No | Partitioned processing without constraint |

## Critical: Partitioned Mode

**The problem:** Non-partitioned FDAF requires `BlockLength = Length`. For a 2048-tap filter at 16 kHz, this results in 128 ms latency, which is too high for real-time applications.

**The solution:** `'Partitioned constrained FDAF'` splits the filter into `Length/BlockLength` partitions, each processed using a small FFT. The latency drops to `BlockLength/fs`.

```matlab
fdaf = dsp.FrequencyDomainAdaptiveFilter( ...
    Length=2048, ...
    BlockLength=128, ...
    Method="Partitioned constrained FDAF", ...
    StepSize=0.5);
% Latency = 128/16000 = 8 ms (not 128 ms!)
```

**Silent failure trap:** Using `'Constrained FDAF'` (non-partitioned) with `BlockLength < Length` does NOT error. Instead, it silently runs without actual partitioning. The `FFTCoefficients` becomes a `1×(Length+BlockLength)` vector instead of the correct `P×(2*BlockLength)` matrix. Only `'Partitioned constrained FDAF'` enables true multi-partition processing.

## Construction

```matlab
fdaf = dsp.FrequencyDomainAdaptiveFilter( ...
    Length=filterLength, ...
    BlockLength=blockSize, ...
    Method="Partitioned constrained FDAF", ...
    StepSize=0.5, ...
    AveragingFactor=0.9, ...
    InitialPower=0.01);
```

## Key Properties

| Property | Purpose | Notes |
|----------|---------|-------|
| `Length` | Adaptive filter length (taps) | Defines the full impulse response length |
| `BlockLength` | Processing frame size | Input size must match this value exactly |
| `Method` | Algorithm variant | See the Methods table above |
| `StepSize` | Convergence rate parameter bounded in the range [0, 1] | Default is 1.0 which **often diverges** — start with 0.3–0.5 |
| `AveragingFactor` | Exponential smoothing of power estimate | Default is 0.9; values ≥0.99 can cause instability due to power estimate updating too slowly |
| `InitialPower` | Seeds the power estimate | Important for early convergence |
| `LockCoefficients` | Enable/disable adaptation (true/false) | Tunable; when true, freezes coefficients; can toggle between calls without reset |

## Freeze Adaptation

Use `LockCoefficients` — NOT `AdaptInputPort` (which does not exist on this object):

```matlab
fdaf.LockCoefficients = true;   % Freeze coefficient updates
[y, e] = fdaf(xBlock, dBlock);  % Filtering continues, no adaptation
```

## No maxstep() or msesim() support

`maxstep()` and `msesim()` are NOT available for `dsp.FrequencyDomainAdaptiveFilter`.

- Tune the step size empirically
- Start with values around 0.3 to 0.5 and reduce if the algorithm becomes unstable.

## State Management

- `States` is a **read-only** property (cannot be modified or set to zero manually)
- `release(fdaf)` clears ALL internal state (FFTCoefficients, States, Power become `[]`). Also, discards the adapted coefficients
- `reset(fdaf)` zeroes state and coefficients while keeping the object locked
- To clear internal state without losing adapted weights, set `LockCoefficients = true`, pass `Length/BlockLength` blocks of zeros, then pass your signal

```matlab
fdaf.LockCoefficients = true;

% Flush state with zero input
for k = 1:(fdaf.Length / fdaf.BlockLength)
    fdaf(zeros(fdaf.BlockLength,1), zeros(fdaf.BlockLength,1));
end

% Resume with actual signal
[y, e] = fdaf(xBlock, dBlock);
```

## Input Requirements

- Input frame length must be **divisible by** `BlockLength` (multiples work, e.g., frame length = 128 with BlockLength = 64)
- Both input (x) and desired (d) signals must be column vectors
- `Length` must be evenly divisible by `BlockLength` in partitioned mode (hard error otherwise)

## Weight Extraction (FFTCoefficients)

FDAF stores weights in the frequency domain. There is no `.Coefficients` property.

### Non-partitioned mode:

```matlab
fftW = fdaf.FFTCoefficients;  % 1×(Length+BlockLength) vector
timeDomainW = real(ifft(fftW));
adaptedWeights = timeDomainW(1:fdaf.Length);
```

### Partitioned mode:

```matlab
fftW = fdaf.FFTCoefficients;  % P×(2*BlockLength) matrix
% P = Length/BlockLength partitions, each row is one partition's FFT

% Reconstruct time-domain coefficients
P = size(fftW, 1);
adaptedWeights = zeros(fdaf.Length, 1);
for p = 1:P
    wPartition = real(ifft(fftW(p, :)));
    adaptedWeights((p-1)*fdaf.BlockLength + (1:fdaf.BlockLength)) = wPartition(1:fdaf.BlockLength);
end
```

## Streaming Pattern

```matlab
fdaf = dsp.FrequencyDomainAdaptiveFilter( ...
    Length=2048, BlockLength=128, ...
    Method="Partitioned constrained FDAF", ...
    StepSize=0.1);
unknownSys = dsp.FIRFilter(Numerator=roomIR);

numBlocks = 5000;
for k = 1:numBlocks
    xBlock = randn(128, 1);
    dBlock = unknownSys(xBlock);
    [y, e] = fdaf(xBlock, dBlock);
end
```

## Latency Comparison

| Configuration | Latency | Use Case |
|---------------|---------|----------|
| `'Constrained FDAF'`, BlockLength=Length=2048 | 128 ms @16kHz | Offline/non-real-time |
| `'Partitioned constrained FDAF'`, BlockLength=128 | 8 ms @16kHz | Real-time echo cancellation |
| `'Partitioned constrained FDAF'`, BlockLength=64 | 4 ms @16kHz | Low-latency ANC headphones |

----

Copyright 2026 The MathWorks, Inc.

----
