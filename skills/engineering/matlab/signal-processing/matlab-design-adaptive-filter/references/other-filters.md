# Other Adaptive Filter Objects

## dsp.AffineProjectionFilter

**When to use:**

- Input signal is highly correlated (e.g., speech, AR processes, colored noise)
- NLMS converges too slowly
- RLS cost O(*N*²) is too high.

**Why it works:** Projects the weight update onto a P-dimensional subspace of past inputs, effectively decorrelating the input in that subspace. Convergence rate approaches RLS for P≥8 while cost is O(NP + P³).

```matlab
ap = dsp.AffineProjectionFilter( ...
    Length=64, ...
    ProjectionOrder=8, ...
    StepSize=0.1, ...
    InitialOffsetCovariance=0.01);
[y, err] = ap(x, d);
w = ap.Coefficients;  % Has .Coefficients property
```

**Key properties:**
| Property | Purpose | Typical Values |
|----------|---------|----------------|
| `ProjectionOrder` | Subspace dimension (P) controlling decorrelation depth | 4-8 for speech; higher projection order = faster convergence, higher cost |
| `StepSize` | Convergence rate parameter | 0.05-0.5 |
| `InitialOffsetCovariance` | Regularization constant (δ) | 0.001-0.1 |

**Computational cost:** O(NP + P³) per sample.
Example (N = 64, P = 8):

- Affine projection: ~576 multiplications/sample
- NLMS: ~128 multiplications/sample
- RLS: ~4096 multiplications/sample

## dsp.BlockLMSFilter

**When to use:** Frame-based processing in Simulink or when you want block-level weight updates (one update per frame, not per sample).

```matlab
blms = dsp.BlockLMSFilter( ...
    Length=32, ...
    BlockSize=64, ...
    StepSize=0.01);
[y, err, wts] = blms(xBlock, dBlock);
```

**Notes:**
- Supports `maxstep()` (same behavior as `dsp.LMSFilter`)
- Weights are returned via the third output argument (wts)
- Like LMS, there is no `.Coefficients` property
- Input frame size must equal `BlockSize`

## dsp.AdaptiveLatticeFilter

**When to use:**

- Numerical stability is critical (e.g., very long filters or ill-conditioned inputs)
- Order-recursive structure is required (can determine optimal filter order online)

```matlab
lattice = dsp.AdaptiveLatticeFilter( ...
    Length=32, ...
    Method="Least-squares Lattice", ...
    ForgettingFactor=0.99);
[y, err] = lattice(x, d);
w = lattice.Coefficients;  % Has .Coefficients property
```

**Methods:**
- `'Least-squares Lattice'` — Standard LSL algorithm
- `'QR-decomposition LSL'` — Square-root form with better numerical stability
- `'Gradient Adaptive Lattice'` — LMS-like update cost with lattice structure (lower cost and slower convergence)

## dsp.FastTransversalFilter

**When to use:** Need RLS-like convergence speed at O(*N*) cost per sample instead of O(*N*²). Trade-off: less numerically stable than standard RLS.

```matlab
ftf = dsp.FastTransversalFilter( ...
    Length=64, ...
    ForgettingFactor=0.99);
[y, err] = ftf(x, d);
w = ftf.Coefficients;  % Has .Coefficients property
```

**Notes:**
- O(N) per sample vs. O(N²) for standard RLS
- May become numerically unstable for very long runs — consider periodic resets
- Suitable when filter length is large enough that RLS is too expensive but fast convergence is still needed

**ForgettingFactor safe range:**
- Upper bound: `1.0` (infinite memory, best for stationary systems)
- Safe lower bound: `1 - 0.5/Length` (e.g., for L = 64: lambda >= 0.992)
- Below this bound, the algorithm may diverge due to numerical instability, especially for long runs or noisy inputs

```matlab
L = 64;
ftf = dsp.FastTransversalFilter(Length=L, ...
    ForgettingFactor=1 - 0.5/L);  % = 0.9922, safe lower bound
```

## Summary: When to Choose Each

| Need | Object |
|------|--------|
| NLMS too slow, RLS too expensive | `dsp.AffineProjectionFilter` |
| Frame-based updates (Simulink) | `dsp.BlockLMSFilter` |
| High numerical stability for long filters | `dsp.AdaptiveLatticeFilter` |
| RLS-like convergence speed at O(N) cost | `dsp.FastTransversalFilter` |

----

Copyright 2026 The MathWorks, Inc.

----
