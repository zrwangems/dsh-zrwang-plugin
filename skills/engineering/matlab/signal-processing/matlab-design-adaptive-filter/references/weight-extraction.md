# Weight Extraction Reference

## Per-Object Weight Extraction Methods

| Object | Has `.Coefficients`? | Extraction Method | Output Shape |
|--------|---------------------|-------------------|--------------|
| `dsp.LMSFilter` | **No** | Third output: `[y, e, w] = lms(x, d)` | L×1 column |
| `dsp.RLSFilter` | Yes | `rls.Coefficients` | 1×L row |
| `dsp.AffineProjectionFilter` | Yes | `ap.Coefficients` | 1×L row |
| `dsp.FilteredXLMSFilter` | Yes | `fxlms.Coefficients` | 1×L row (negated for ANC) |
| `dsp.FrequencyDomainAdaptiveFilter` | **No** | `real(ifft(fdaf.FFTCoefficients))` | See below |
| `dsp.BlockLMSFilter` | **No** | 3rd output: `[y, e, w] = blms(x, d)` | L×1 column |
| `dsp.AdaptiveLatticeFilter` | Yes | `lattice.Coefficients` | 1×L row |
| `dsp.FastTransversalFilter` | Yes | `ftf.Coefficients` | 1×L row |

## Objects WITHOUT `.Coefficients`

Three objects do NOT have a `.Coefficients` property:

1. **`dsp.LMSFilter`** — Use the third output argument
2. **`dsp.FrequencyDomainAdaptiveFilter`** — Use `.FFTCoefficients` + IFFT
3. **`dsp.BlockLMSFilter`** — Use the third output argument

**Error behavior:**
Attempting to access `.Coefficients` on these throws:
"Unrecognized method, property, or field 'Coefficients'".

## FDAF Coefficient Extraction

### Non-partitioned FDAF (Method = 'Constrained FDAF' or 'Unconstrained FDAF'):

```matlab
fftW = fdaf.FFTCoefficients;       % 1×(2*Length) complex vector
wTime = real(ifft(fftW));
adaptedWeights = wTime(1:fdaf.Length);  % First L samples
```

### Partitioned FDAF (Method = 'Partitioned constrained FDAF'):

```matlab
fftW = fdaf.FFTCoefficients;  % P×(2*BlockLength) complex matrix
P = size(fftW, 1);            % Number of partitions = Length/BlockLength

adaptedWeights = zeros(fdaf.Length, 1);
for p = 1:P
    wPartition = real(ifft(fftW(p, :)));
    adaptedWeights((p-1)*fdaf.BlockLength + (1:fdaf.BlockLength)) = ...
        wPartition(1:fdaf.BlockLength);
end
```

## FxLMS Sign Convention

`dsp.FilteredXLMSFilter` minimizes the error in the ANC topology, where the control signal passes through the secondary path. The `.Coefficients` represent the control filter weights in the ANC sign convention.

If using FxLMS for system identification (secondary path = 1), the coefficients may be **negated** relative to the true system. Compare with: `estimatedSystem = -fxlms.Coefficients`.

## LMS WeightsOutput Modes

The `WeightsOutput` property controls the third output:

| WeightsOutput | Third Output | Use Case |
|---------------|--------------------|----------|
| `'Last'` (default) | Final weight vector (*L*×1) | Most common; converged weights |
| `'All'` | Weight history (*N*×*L* matrix) | Convergence/learning trajectory analysis |
| `'None'` | Not available (error if requested) | Save memory when weights not needed |

----

Copyright 2026 The MathWorks, Inc.

----
