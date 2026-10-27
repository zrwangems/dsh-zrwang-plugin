# Waveform Objects Reference

## Pulsed Waveform Objects

### phased.RectangularWaveform

Simple unmodulated pulse. Use for baseline comparisons or when no pulse
compression is needed.

| Property | Description |
|----------|-------------|
| `PulseWidth` | Pulse duration (s) |
| `PRF` | Scalar or row vector (staggered PRF) |
| `SampleRate` | Sample rate (Hz) |
| `DutyCycle` | Controls duty cycle (< 1); for CW use `PRF = 1/PulseWidth` instead |

### phased.LinearFMWaveform

Linear frequency modulated (chirp) pulse. Most common radar waveform. Doppler
tolerant — Doppler shift causes range shift but minimal SNR loss.

| Property | Description |
|----------|-------------|
| `PulseWidth` | Pulse duration (s) |
| `SweepBandwidth` | Frequency sweep range (Hz) |
| `SweepDirection` | 'Up' or 'Down' (NOT 'Triangle' — that is FMCWWaveform only) |
| `SweepInterval` | 'Positive' or 'Symmetric' |
| `Envelope` | `'Rectangular'` (default) or `'Gaussian'` |
| `SampleRate` | Sample rate (Hz) |
| `PRF` | Scalar or row vector (staggered PRF) |
| `DutyCycle` | Controls duty cycle (< 1); for CW use `PRF = 1/PulseWidth` instead |

Range resolution = c / (2 * SweepBandwidth).

Unique method: `getStretchProcessor` — returns a `phased.StretchProcessor` for
wideband processing without wideband ADC (not available on other waveform objects).

### phased.NonlinearFMWaveform (R2023a)

Nonlinear FM pulse with 4 built-in modulation types. Each type has its own
configurable parameters — you cannot feed arbitrary frequency profiles.

| FrequencyModulation | Key Parameters |
|--------------------|----------------|
| `'Polynomial'` | `PolynomialCoefficients`, `SweepBandwidth` |
| `'Hyperbolic'` | `HyperbolicStartFrequency`, `SweepBandwidth` |
| `'Hybrid Linear-Tangent'` | `LinearTangentBalance`, `TangentCurvePortion`, `SweepBandwidth` |
| `'Stepped Price'` | `NumSteps`, `BandwidthFactors` |

`Envelope` property: `'Rectangular'`, `'Gaussian'`, `'Hamming'`, `'Chebyshev'`,
`'Hann'`, `'Kaiser'`, `'Taylor'`, `'Custom'`.

Use for inherent low sidelobes when one of the 4 types fits. For arbitrary
NLFM shapes, use `phased.CustomFMWaveform` instead.

**Parameterization guidance:**

| Type | Good Starting Point | Achievable PSL |
|------|-------------------|----------------|
| Hybrid Linear-Tangent | Balance=0.80, Curve=1.35 | -33 to -37 dB |
| Stepped Price | NumSteps=50, BandwidthFactors=[0.1·BW, 0.2·BW] | -35 to -40 dB |
| Polynomial | Low-order perturbation of LFM (see below) | -20 to -27 dB |
| Hyperbolic | StartFreq=0.05·BW | -40+ dB but high broadening |

**Polynomial type — critical details:**

`PolynomialCoefficients` uses MATLAB `polyval` descending power convention
evaluated on `linspace(-1, 1, N)`:

```
polyval([a, b, c, d], n) = a*n^3 + b*n^2 + c*n + d
```

The implementation normalizes: `y = polyval(p, n); y = y - min(y); f = BW * y / max(y)`.
This means:
- **The last element (constant term) is always removed** — varying it has no effect
- **LFM equivalent is `[0, 1, 0]`** (not `[1, 0, 0]` which is quadratic)
- **To perturb from LFM:** add odd power terms: `[a3, 0, 1, 0]` for cubic

For PSL below -30 dB, use `nlfmspec2freq` + `CustomFMWaveform` instead — the
Polynomial type is limited by its parametric form and is not numerically
practical at the high orders needed for deep sidelobes.

**Note:** Stepped Price does not use `SweepBandwidth` — bandwidth is determined
by `NumSteps` and `BandwidthFactors`. Setting `SweepBandwidth` produces a warning.

### phased.CustomFMWaveform (R2023a)

User-defined frequency modulation. Maximum flexibility for NLFM design.

| Property | Description |
|----------|-------------|
| `FrequencyModulation` | Vector of frequency samples, function handle, or cell array |
| `Envelope` | `'Rectangular'`, `'Gaussian'`, `'Hamming'`, `'Chebyshev'`, `'Hann'`, `'Kaiser'`, `'Taylor'`, `'Custom'` |
| `PulseWidth` | Pulse duration (s) |
| `SampleRate` | Sample rate (Hz) |
| `PRF` | Scalar or row vector (staggered PRF) |
| `DutyCycle` | Controls duty cycle (< 1); for CW use `PRF = 1/PulseWidth` instead |

**FrequencyModulation input options:**
- Vector: M frequency values → M-1 piecewise linear FM segments
- Function handle: `@(t) freqProfile(t)` where t is 0 to PulseWidth
- Cell array: `{@fcn, arg1, arg2, ...}`

**Primary use case:** Pair with `nlfmspec2freq` for stationary-phase NLFM design.

### phased.PhaseCodedWaveform

Phase-coded pulse waveform. Also serves as a general-purpose waveform container
via `Code='Custom'`.

| Property | Description |
|----------|-------------|
| `Code` | Code type (see phase-code-reference.md) |
| `CustomCode` | Complex-valued vector (used when Code='Custom') |
| `ChipWidth` | Duration of each chip (s) |
| `NumChips` | Number of chips per pulse (do NOT set when using Custom — inferred from vector) |
| `PRF` | Pulse repetition frequency (Hz) |
| `SampleRate` | Sample rate (Hz) |

**No `DutyCycle` property.** For CW operation, set `PRF = 1/(NumChips * ChipWidth)`
so the pulse fills the entire PRI (100% duty).

**CustomCode accepts arbitrary complex (IQ) values** — not limited to phase-only.
This makes it a general waveform container for integrating external waveforms
into the toolbox ecosystem.

### phased.SteppedFMWaveform

Achieves high range resolution by stepping frequency across pulses while keeping
instantaneous bandwidth low. No wideband ADC or analog FM linearity required.

| Property | Description |
|----------|-------------|
| `NumSteps` | Number of frequency steps |
| `FrequencyStep` | Step size (Hz) |
| `PulseWidth` | Per-step pulse duration (s); must be ≤ 1/PRF |
| `DutyCycle` | Alternative to PulseWidth (set `DurationSpecification` to `'Duty cycle'`) |
| `PRF` | Pulse repetition frequency (Hz); scalar or row vector |
| `PRFSelectionInputPort` | Enable dynamic PRF selection via index input |
| `SampleRate` | Sample rate (Hz) |

**Key formulas:**
- Effective bandwidth = `NumSteps × FrequencyStep`
- Range resolution = `c / (2 × NumSteps × FrequencyStep)`
- Max unambiguous range = `(c × PRF) / (2 × FrequencyStep)`

**When to choose over LFM:** When high range resolution is needed but wideband
instantaneous hardware is not available. Unlike stretch processing (which requires
approximate target range), stepped FM works without prior range knowledge.

**Processing example:** Coherent integration across frequency steps using
`phased.RangeResponse` with synthesized sweep slope:

```matlab
% Configure stepped FM waveform
fstep = 500e3;
nSteps = 150;  % effective BW = 75 MHz
prf = 20e3;
pulseWidth = 1e-6;  % must be ≤ 1/PRF
sfmwav = phased.SteppedFMWaveform('NumSteps', nSteps, ...
    'FrequencyStep', fstep, 'PulseWidth', pulseWidth, ...
    'SampleRate', 2*fstep, 'PRF', prf);

% Processing: matched filter per step, then range FFT across steps
mfCoeffs = getMatchedFilter(sfmwav);
mf = phased.MatchedFilter('Coefficients', mfCoeffs);

% Range response uses PRF as "sample rate" and synthesized sweep slope
rngresp = phased.RangeResponse('RangeMethod', 'FFT', ...
    'SampleRate', prf, ...
    'SweepSlope', fstep * prf);
```

**Staggered PRF — Indexed selection:** All pulsed objects support
`PRFSelectionInputPort = true` to manually select which PRF to use per call:

```matlab
wav = phased.LinearFMWaveform('PulseWidth', 10e-6, ...
    'SweepBandwidth', 5e6, 'PRF', [5000 10000 20000], ...
    'PRFSelectionInputPort', true);
sig = wav(2);  % use PRF(2) = 10000 Hz
```

## Common Methods on Pulsed Objects

All pulsed waveform objects (except `SteppedFMWaveform`) support:

| Method | Returns |
|--------|---------|
| `bandwidth(wav)` | Waveform bandwidth in Hz |
| `getMatchedFilter(wav)` | Matched filter coefficients |
| `plot(wav)` | Plot the pulse waveform |

**What `bandwidth` returns per object:**

| Object | `bandwidth` value |
|--------|-------------------|
| `RectangularWaveform` | `1/PulseWidth` |
| `LinearFMWaveform` | `SweepBandwidth` |
| `NonlinearFMWaveform` | Frequency span of the modulation |
| `CustomFMWaveform` | Frequency span of the modulation |
| `PhaseCodedWaveform` | `1/ChipWidth` |

`SteppedFMWaveform` does not have `bandwidth` — compute as `NumSteps * FrequencyStep`.

## Continuous Waveform Objects

**CW objects do NOT have `getMatchedFilter` or `bandwidth`.** FMCW uses dechirp/stretch
processing; MFSK uses beat frequency + phase difference processing. For bandwidth,
read the `SweepBandwidth` property directly.

### phased.FMCWWaveform

Frequency-modulated continuous wave. Standard for automotive radar (77 GHz).
Only supports linear sweeps.

| Property | Description |
|----------|-------------|
| `SweepBandwidth` | Total sweep bandwidth (Hz); scalar or row vector |
| `SweepTime` | Sweep duration (s); scalar or row vector |
| `SweepDirection` | 'Up', 'Down', or 'Triangle' |
| `SweepInterval` | 'Positive' or 'Symmetric' |
| `SampleRate` | Sample rate (Hz) |

`SweepTime` and `SweepBandwidth` accept row vectors for varying sweep parameters
across successive periods (similar to staggered PRF for pulsed waveforms).

For nonlinear FM CW: use `phased.CustomFMWaveform` or `phased.NonlinearFMWaveform`
with `PRF = 1/PulseWidth` (100% duty cycle).

### phased.MFSKWaveform

Multiple frequency-shift keying continuous wave. Combines two interleaved FMCW
sweeps with a fixed frequency offset to enable simultaneous range and speed
estimation without ghost targets (unlike triangle FMCW).

| Property | Description |
|----------|-------------|
| `SweepBandwidth` | Total sweep bandwidth (Hz) |
| `StepsPerSweep` | Number of frequency steps per sweep (must be even) |
| `StepTime` | Time per step (s) |
| `FrequencyOffset` | Fixed frequency offset between the two interleaved sweeps (Hz) |
| `SampleRate` | Sample rate (Hz) |
| `OutputFormat` | `'Steps'`, `'Sweeps'`, or `'Samples'` |
| `NumSweeps` | Number of sweeps to output (when OutputFormat = 'Sweeps') |

**Key advantage over triangle FMCW:** No ghost targets in multi-target scenarios.
Triangle FMCW produces false targets when up-sweep and down-sweep beat frequencies
are incorrectly paired. MFSK resolves range and velocity unambiguously from a
single sweep using beat frequency + inter-sweep phase difference.

**Critical constraints (must satisfy all before constructing):**

| Constraint | Rule | Fix |
|-----------|------|-----|
| Integer samples per step | `SampleRate × StepTime` must be an integer | Choose `StepTime = N / SampleRate` for integer N |
| Nyquist on offset sweep | `SampleRate > SweepBandwidth + FrequencyOffset` | Increase `SampleRate` or reduce `FrequencyOffset` |
| Memory-safe analysis | High `SampleRate` with long `StepTime` creates large arrays that exhaust memory during ambiguity analysis | Keep `SampleRate` ≤ 50 MHz or limit analysis to individual steps |

**Recommended parameter derivation order:**

1. Choose `SweepBandwidth` from range resolution: `BW = c / (2 × ΔR)`
2. Choose `FrequencyOffset` from max velocity: `Foff = 2 × vmax / λ`
3. Set `SampleRate` ≥ 2 × (`SweepBandwidth` + `FrequencyOffset`), rounded to convenient value
4. Choose `StepsPerSweep` (even integer) from velocity resolution
5. Compute `StepTime` = integer / `SampleRate` such that total sweep time fits coherence requirements

----

Copyright 2026 The MathWorks, Inc.

----
