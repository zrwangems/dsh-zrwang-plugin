# Analysis Functions Reference

## Ambiguity Function

### ambgfun — Standard Ambiguity Function

Use for any waveform: single pulses, pulse trains, or arbitrary signals.

```matlab
[afmag, delay, doppler] = ambgfun(sig, fs, prf);
[afmag, delay, doppler] = ambgfun(sig, fs, prf, 'Cut', 'Doppler');
[afmag, delay, doppler] = ambgfun(sig, fs, prf, 'Cut', 'Delay');
```

**Inputs:**
- `sig` — waveform samples (complex vector)
- `fs` — sample rate (Hz)
- `prf` — pulse repetition frequency (Hz)

**Cut options:**
- `'2D'` — full delay-Doppler surface (default)
- `'Doppler'` — zero-delay cut (shows Doppler tolerance)
- `'Delay'` — zero-Doppler cut (shows range resolution and sidelobes)

Works with pulse trains: pass the full multi-pulse signal.

**Doppler tolerance check** — use `'Cut', 'Doppler'` with `'CutValue'` to measure
true SNR loss at a specific Doppler shift. This compares the peak of the range
response at that Doppler to the peak at zero Doppler — the target is still
detectable regardless of which range cell it lands in:

```matlab
% Measure true SNR loss at max target velocity
[cut0, ~] = ambgfun(sig, fs, prf, 'Cut', 'Doppler', 'CutValue', 0);
[cutFd, ~] = ambgfun(sig, fs, prf, 'Cut', 'Doppler', 'CutValue', fdMax);
dopplerLoss = mag2db(max(cutFd) / max(cut0));
```

Do NOT use the zero-delay cut (`'Cut','Delay','CutValue',0`) for this — it
conflates range-Doppler coupling (peak shifting to a different range cell) with
actual SNR degradation.

### pambgfun — Periodic Ambiguity Function

Use for CW and periodic waveforms. Exploits signal periodicity to improve
Doppler resolution by factor 1/NT (N periods, T period duration).

```matlab
[paf, delay, doppler] = pambgfun(sig, fs, numPeriods);
[paf, delay, doppler] = pambgfun(sig, fs, numPeriods, 'Cut', '2D');
[paf, delay, doppler] = pambgfun(sig, fs, numPeriods, 'Cut', 'Delay');
[paf, delay, doppler] = pambgfun(sig, fs, numPeriods, 'Cut', 'Doppler');
```

**Inputs:**
- `sig` — one period of the waveform (complex vector)
- `fs` — sample rate (Hz)
- `numPeriods` — number of periods to analyze

**When to use pambgfun vs ambgfun:**

| Waveform | Use | Reason |
|----------|-----|--------|
| Single pulse | `ambgfun` | Non-periodic signal |
| Pulse train | `ambgfun` | Pass full signal; standard analysis |
| FMCW | `pambgfun` | Periodic — exploits periodicity for better Doppler resolution |
| Phase-coded CW (duty cycle = 1) | `pambgfun` | Periodic CW signal |
| Any waveform where periodicity is key | `pambgfun` | Improved Doppler resolution |

```matlab
% Periodic ambiguity function for FMCW
wav = phased.FMCWWaveform('SweepBandwidth', 150e6, 'SweepTime', 7e-6);
sig = wav();
[paf, delay, doppler] = pambgfun(sig, wav.SampleRate, 10, 'Cut', '2D');
```

## Sidelobe Measurement

### sidelobelevel (R2024b)

Measure peak sidelobe level (PSL) and integrated sidelobe level (ISL).

```matlab
psl = sidelobelevel(sig_dB);
[psl, isl] = sidelobelevel(sig_dB);
```

**Input must be in dB.** Convert matched filter output to dB before passing.
Always use this function instead of computing sidelobes manually.

```matlab
wav = phased.LinearFMWaveform('PulseWidth', 10e-6, 'SweepBandwidth', 5e6);
mfCoeffs = getMatchedFilter(wav);
mf = phased.MatchedFilter('Coefficients', mfCoeffs);
sig = wav();
mfOut = mf(sig);
psl = sidelobelevel(mag2db(abs(mfOut)));
fprintf('Peak sidelobe level: %.1f dB\n', psl);
```

## Spectral Shaping

### shapespectrum (R2024b)

**Purpose: Spectral notching and mask application to avoid interference.**

This function is NOT for sidelobe reduction. It modifies a waveform's spectrum
to meet spectral mask requirements (e.g., avoiding interference with other
systems).

```matlab
[y, info] = shapespectrum(desiredSpectrum, x);
[y, info] = shapespectrum(ds, x, 'MaxIterations', 1000, ...
    'SpectrumRMSEThreshold', 0.01);
```

**Inputs:**
- `desiredSpectrum` — target spectrum shape in dB (N-by-1 or N-by-2 for bounds)
- `x` — initial waveform (complex vector, same length as desiredSpectrum)

**Key parameters:**
- `MaxIterations` — maximum iterations (default 500)
- `SpectrumRMSEThreshold` — convergence tolerance (default 0)
- `Magnitude` — time-domain magnitude constraint
- `DesiredSpectrumRange` — 'twosided' or 'centered'

**Use cases:**
- Spectral notching to avoid GPS, communications bands
- Applying regulatory spectral masks
- Shaping spectrum to reduce out-of-band emissions

**NOT for:** Sidelobe reduction in pulse compression. Use windowed matched
filter or NLFM design instead.

----

Copyright 2026 The MathWorks, Inc.

----
