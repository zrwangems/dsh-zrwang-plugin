# dsp.LMSFilter

## Methods (5 variants via `Method` property)

| Method | Algorithm | Cost/Sample | Best For |
|---------------|-----------|-------------|----------|
| `'LMS'` | Standard LMS | O(*N*) | White inputs; simple use cases |
| `'Normalized LMS'` | NLMS (power-normalized) | O(*N*) | Default choice; robust to input power variations |
| `'Sign-Error LMS'` | Uses sign(e) in update | O(*N*), fewer multiplications | Robust to impulsive noise |
| `'Sign-Data LMS'` | Uses sign(x) in update | O(*N*), no multiplications | Minimal computation |
| `'Sign-Sign LMS'` | Uses sign(e)×sign(x) | O(*N*), no multiplications | Extremely low-cost implementations |

## Construction

```matlab
lms = dsp.LMSFilter( ...
    Length=32, ...
    Method="Normalized LMS", ...
    StepSize=0.01);
```

## Step Size Selection with maxstep()

```matlab
[muMax, muMaxMSE] = maxstep(lms, x);
lms.StepSize = 0.3 * muMaxMSE;
```

**Two-output syntax:**
- `muMax` — Upper bound for convergence (filter converges but may result in excess MSE)
- `muMaxMSE` — Mean-square stability bound (more conservative)

**Recommendation:**
- Use `muMaxMSE` for robust operation: `StepSize = 0.3 * muMaxMSE`

**maxstep() compatibility:**

| Method | maxstep() Works? | Typical Return |
|--------|-----------------|----------------|
| `'LMS'` | Yes | Data-dependent (e.g., ~0.05 for unit-variance input, *L*=32) |
| `'Normalized LMS'` | Yes | 2.0 (both outputs) |
| `'Sign-Error LMS'` | Yes | Inf (bounded update; not practically useful) |
| `'Sign-Data LMS'` | **ERROR** | "Method property value must be set to 'LMS', 'Normalized LMS' or 'Sign-Error LMS'" |
| `'Sign-Sign LMS'` | **ERROR** | Same error as Sign-Data LMS |

**When maxstep() is unavailable:**

- Start with a small step size (e.g., `StepSize = 0.005`)
- Increase step size gradually until convergence speed is acceptable without divergence
- Reduce step size if the algorithm becomes unstable

### Sign-Based Methods: Set Non-Zero Initial Weights

`'Sign-Data'`, `'Sign-Error'`, and `'Sign-Sign'` variants can stall with zero initial weights: `sign(0) = 0` makes the update term become zero and results in no adaptation.

Use small nonzero initial conditions:
```matlab
lms = dsp.LMSFilter(Length=32, Method="Sign-Sign LMS", ...
    StepSize=0.001, InitialConditions=0.001*ones(32, 1));
```

## Weight Extraction

Weights are returned as the **3rd output argument** (there is no `.Coefficients` property):

```matlab
[y, err, wts] = lms(x, d);
```

- `WeightsOutput = 'Last'` (default) — `wts` is the final weight vector (*L*×1)
- `WeightsOutput = 'All'` — `wts` is N×L matrix (weight history over time)
- `WeightsOutput = 'None'` — 3rd output is not available (error if requested)

## Adaptation Control (Freeze/Unfreeze)

```matlab
lms = dsp.LMSFilter(Length=32, AdaptInputPort=true);

% Pass adaptation flag as 3rd input argument
adaptFlag = true;
[y, err, wts] = lms(x, d, adaptFlag);  % adapting

adaptFlag = false;
[y, err, wts] = lms(x, d, adaptFlag);  % frozen (weights unchanged, still filtering)
```

**Best practice:**

- Use `AdaptInputPort` to control adaptation dynamically
- **Never** implement freeze control with `if/else` around the filter call

## Common Configuration

```matlab
lms = dsp.LMSFilter( ...
    Length=filterLength, ...
    Method="Normalized LMS", ...
    StepSize=0.01, ...
    LeakageFactor=1.0, ...        % No leakage (default)
    AdaptInputPort=true, ...       % Enable dynamic adaptation control
    WeightsOutput="Last");         % Return final weights only
```

## Streaming Pattern

```matlab
unknownSys = dsp.FIRFilter(Numerator=trueCoeffs);
lms = dsp.LMSFilter(Length=numel(trueCoeffs), Method="Normalized LMS");
[~, muMaxMSE] = maxstep(lms, randn(1000, 1));
lms.StepSize = 0.3 * muMaxMSE;

numFrames = 200;
frameSize = 256;
for k = 1:numFrames
    xFrame = randn(frameSize, 1);
    dFrame = unknownSys(xFrame);
    [~, ~, wts] = lms(xFrame, dFrame);
end
```

----

Copyright 2026 The MathWorks, Inc.

----
