# dsp.FilteredXLMSFilter

## When to use dsp.FilteredXLMSFilter

Active noise control (ANC) — Any scenario where the adaptive filter output passes through a **secondary path** (speaker → error microphone transfer function) before reaching the error sensor.

Standard LMS diverges in this topology because the gradient is misaligned with the actual error (secondary path distortion is unaccounted for). Filtered-X LMS compensates by filtering the reference signal through an estimate of the secondary path before computing the weight update.

## Two-Stage ANC Workflow

### Stage 1: Estimate Secondary Path

Use `dsp.LMSFilter` or `dsp.RLSFilter` to identify the secondary path offline.

```matlab
secPathLen = 32;
secPathTrue = fir1(secPathLen-1, 0.5);

% Probe the secondary path with white noise
probe = 0.1 * randn(10000, 1);
secOutput = filter(secPathTrue, 1, probe);

% Estimate using LMS
estFilter = dsp.LMSFilter(Length=secPathLen, Method="Normalized LMS");
[~, muMaxMSE] = maxstep(estFilter, probe);
estFilter.StepSize = 0.3 * muMaxMSE;
[~, ~, secPathEst] = estFilter(probe, secOutput);
```

### Stage 2: Configure FxLMS Controller

```matlab
fxlms = dsp.FilteredXLMSFilter( ...
    Length=ctrlFilterLen, ...
    StepSize=0.001, ...
    SecondaryPathCoefficients=secPathTrue, ...
    SecondaryPathEstimate=secPathEst.', ...
    LeakageFactor=1.0);
```

### Stage 2 (alternative): Simulation vs. Real Deployment

| Property | Purpose | When to Set |
|----------|---------|-------------|
| `SecondaryPathCoefficients` | True secondary path (used to simulate the physical path in the error signal) | **Simulation only** — models the actual speaker-to-mic transfer |
| `SecondaryPathEstimate` | Estimated secondary path (used internally for filtered-x gradient) | **Always** — this is what the algorithm uses for adaptation |

In simulation, set BOTH. In real deployment, only `SecondaryPathEstimate` matters (the physical path is the real world).

## Running the Controller

```matlab
for k = 1:numFrames
    refFrame = reference((k-1)*frameSize+1 : k*frameSize);
    errFrame = errorMic((k-1)*frameSize+1 : k*frameSize);
    [y, e] = fxlms(refFrame, errFrame);
end
```

- `y` — control signal sent to the cancellation speaker
- `e` — residual error at the error microphone

## Weight Extraction

```matlab
w = fxlms.Coefficients;  % Row vector of adapted control filter weights
```

**Sign convention:** The `.Coefficients` are the raw weights of the control filter. In the ANC topology where the object minimizes `d + S*W*x` (where S is the secondary path), the coefficients may appear negated compared to a system identification setup. If comparing to a known primary path, negate: `primaryEst = -fxlms.Coefficients`.

## Key Properties

| Property | Default | Purpose |
|----------|---------|---------|
| `Length` | 32 | Control filter length |
| `StepSize` | 0.1 | LMS step size for weight updates |
| `LeakageFactor` | 1.0 | Leakage factor for coefficient decay (< 1 prevents drift; use 0.999-1.0) |
| `SecondaryPathCoefficients` | 1 | True secondary path used to simulate how the controller output propagates to the error sensor |
| `SecondaryPathEstimate` | 1 | Estimated secondary path used internally for filtered-x gradient |

## Freeze Adaptation

```matlab
fxlms.LockCoefficients = true;   % Freeze coefficient updates
[y, e] = fxlms(x, d);           % Filtering continues, no adaptation
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `dsp.LMSFilter` for ANC | Use `dsp.FilteredXLMSFilter`, which handles the filtered-x gradient internally |
| Setting only `SecondaryPathEstimate` in simulation | Also set `SecondaryPathCoefficients` to model the physical secondary path |
| Forgetting to transpose the estimated path | Ensure `SecondaryPathEstimate` is a row vector; LMS 3rd output is a column |
| Calling `maxstep()` on FxLMS | Not supported; tune `StepSize` empirically (start ~0.001) |

----

Copyright 2026 The MathWorks, Inc.

----
