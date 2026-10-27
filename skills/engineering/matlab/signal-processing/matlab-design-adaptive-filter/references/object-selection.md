# Object Selection Guide

## Decision Flow

1. **Is there a secondary path (ANC)?** → Use `dsp.FilteredXLMSFilter`
2. **Long filters (> 256 taps)?** → Use `dsp.FrequencyDomainAdaptiveFilter`
3. **Need fast convergence or strong tracking?** → Use `dsp.RLSFilter`
4. **Input is highly correlated/colored?** → Use `dsp.AffineProjectionFilter`
5. **General-purpose / default** → Use `dsp.LMSFilter` with `'Normalized LMS'`

## Full Decision Matrix

| Application | Input Signal | Filter Length | Latency Constraint | Recommended Object | Method/Config |
|-------------|-------------|---------------|--------------------|--------------------|---------------|
| System ID | White | < 256 | None | `dsp.LMSFilter` | `'Normalized LMS'` |
| System ID | Colored (AR/speech) | < 256 | None | `dsp.AffineProjectionFilter` | `ProjectionOrder=4-8` |
| System ID | Any | > 256 | None | `dsp.FrequencyDomainAdaptiveFilter` | `'Constrained FDAF'` |
| System ID | Any | > 256 | Low (block-based) | `dsp.FrequencyDomainAdaptiveFilter` | `'Partitioned constrained FDAF'` |
| System ID | Any | Any | Fast convergence | `dsp.RLSFilter` | `ForgettingFactor=0.99` |
| Noise cancellation | Correlated reference | < 256 | None | `dsp.LMSFilter` | `'Normalized LMS'` |
| Echo cancellation | Speech (colored) | 500-8000 | < 10 ms | `dsp.FrequencyDomainAdaptiveFilter` | `'Partitioned constrained FDAF'` |
| Active noise control | Any | Any | N/A | `dsp.FilteredXLMSFilter` | + secondary path |
| Inverse ID / equalization | White | Any | Fast convergence | `dsp.RLSFilter` | delay in desired signal |
| Adaptive prediction | Delayed self | < 256 | None | `dsp.LMSFilter` | `'Normalized LMS'` |
| Tracking time-varying system | Any | Any | Fast tracking | `dsp.RLSFilter` | `ForgettingFactor=0.95-0.98` |
| Low-complexity (embedded) | Any | Any | None | `dsp.LMSFilter` | `'Sign-Data LMS'` or `'Sign-Sign LMS'` |
| RLS-like speed with LMS-like lower cost | Any | Any | None | `dsp.FastTransversalFilter` | O(N) fast RLS |
| High numerical stability required | Any | Any | None | `dsp.AdaptiveLatticeFilter` | Order-recursive |

## Object Capabilities Summary

| Object | Methods | `.Coefficients`? | `maxstep()`? | Streaming |
|--------|---------|-------------------|--------------|-----------|
| `dsp.LMSFilter` | LMS, Normalized LMS, Sign-Error LMS, Sign-Data LMS, Sign-Sign LMS | No (3rd output) | Yes (3 of 5 methods) | Sample or frame |
| `dsp.RLSFilter` | Conventional RLS, Householder RLS, QR-decomposition RLS, Sliding-window RLS, Householder sliding-window RLS | Yes | No | Sample |
| `dsp.AffineProjectionFilter` | — | Yes | No | Sample |
| `dsp.FilteredXLMSFilter` | — | Yes (negated) | No | Sample |
| `dsp.FrequencyDomainAdaptiveFilter` | Constrained FDAF, Unconstrained FDAF, Partitioned constrained FDAF, Partitioned unconstrained FDAF | No (FFTCoefficients) | No | Frame = BlockLength |
| `dsp.BlockLMSFilter` | Block LMS | No (3rd output) | Yes | Frame = BlockSize |
| `dsp.AdaptiveLatticeFilter` | Least-squares Lattice, QR-decomposition LSL, Gradient Adaptive Lattice | Yes | No | Sample |
| `dsp.FastTransversalFilter` | — | Yes | No | Sample |

## When NLMS Is NOT Enough

NLMS normalizes by input power but uses only a scalar normalization (1/||*x*||²). When input has high eigenvalue spread (colored signals like speech, AR processes), NLMS converges at a rate bounded by the condition number of the input correlation matrix.

**Symptoms:**

- NLMS takes >10× expected samples to converge, or
- Steady-state misalignment is 15+ dB worse than expected.

**Solutions (in order of preference):**
1. `dsp.AffineProjectionFilter` — Use `ProjectionOrder=4-8`
   - Decorrelates in *P*-dimensional subspace
   - O(*NP*) cost
2. `dsp.FrequencyDomainAdaptiveFilter`
   - Performs implicit decorrelation via FFT
   - O(*N* log N) cost per block
3. `dsp.RLSFilter`
   - Provides near-optimal convergence (independent of eigenvalue spread)
   - Cost: O(*N*²)

----

Copyright 2026 The MathWorks, Inc.

----
