# maxstep() Reference

## Syntax

```matlab
muMax = maxstep(lmsFilter, x);
[muMax, muMaxMSE] = maxstep(lmsFilter, x);
```

- `muMax` — Maximum step size for convergence (prevents filter divergence but may yield higher steady-state error)
- `muMaxMSE` — Maximum step size for mean-square stability (more conservative)
- `x` — Representative input signal used to estimate input power

**Always use two-output syntax** and set `StepSize = 0.3 * muMaxMSE` for robust convergence.

## Compatibility

| Object | Method | Supports maxstep() | Notes |
|--------|--------|-----------|-------|
| `dsp.LMSFilter` | `'LMS'` | **Yes** | Returns data-dependent bounds |
| `dsp.LMSFilter` | `'Normalized LMS'` | **Yes** | Returns [2.0, 2.0] (always) |
| `dsp.LMSFilter` | `'Sign-Error LMS'` | **Yes** | Returns [Inf, Inf] (not useful) |
| `dsp.LMSFilter` | `'Sign-Data LMS'` | **Error** | "Method property value must be set to..." |
| `dsp.LMSFilter` | `'Sign-Sign LMS'` | **Error** | Same as Sign-Data |
| `dsp.BlockLMSFilter` | Any | **Yes** | Same behavior as LMSFilter |
| `dsp.RLSFilter` | Any | **Error** | "Undefined function 'maxstep'" — RLS uses ForgettingFactor |
| `dsp.AffineProjectionFilter` | — | **Error** | Not supported |
| `dsp.FilteredXLMSFilter` | — | **Error** | Not supported |
| `dsp.FrequencyDomainAdaptiveFilter` | Any | **Error** | Not supported |
| `dsp.AdaptiveLatticeFilter` | Any | **Error** | Not supported |
| `dsp.FastTransversalFilter` | — | **Error** | Not supported |

## Fallback Step Size Selection

When `maxstep()` is unavailable:

| Object | Parameter | Starting Value | Tuning |
|--------|-----------|---------------|--------|
| `dsp.LMSFilter` (Sign-Data/Sign-Sign) | `StepSize` | 0.005 | Increase until convergence; reduce if unstable |
| `dsp.AffineProjectionFilter` | `StepSize` | 0.1 | Typical range: 0.01-0.5 |
| `dsp.FilteredXLMSFilter` | `StepSize` | 0.001 | Very conservative; Secondary path amplifies instability |
| `dsp.FrequencyDomainAdaptiveFilter` | `StepSize` | 0.5 | Typical range: 0.1-1.0 (different scale from time-domain) |
| `dsp.RLSFilter` | `ForgettingFactor` | 0.99 | Typical range: 0.95-1.0 (not a step size) |
| `dsp.FastTransversalFilter` | `ForgettingFactor` | 0.99 | Similar tuning behavior to RLS |

## Convergence Verification with msesim()

After selecting a step size, use `msesim()` to verify convergence:

```matlab
lms = dsp.LMSFilter(Length=32, StepSize=0.01);
X = randn(5000, 25);  % 25 Monte Carlo trials
D = zeros(5000, 25);
for t = 1:25
    D(:,t) = filter(trueCoeffs, 1, X(:,t)) + 0.01*randn(5000, 1);
end
mse = msesim(lms, X, D);
plot(10*log10(mse));
xlabel('Sample'); ylabel('MSE (dB)'); title('Learning Curve');
```

- `msesim()` works with `dsp.LMSFilter` and `dsp.BlockLMSFilter`.
- It returns ensemble-averaged MSE across trials
- The resulting curve is typically smoother than single-run learning curves.

----

Copyright 2026 The MathWorks, Inc.

----
