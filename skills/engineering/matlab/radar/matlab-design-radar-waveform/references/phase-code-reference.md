# Phase Code Reference

## Available Codes in phased.PhaseCodedWaveform

### Binary Codes

| Code | NumChips Constraint | Notes |
|------|-------------------|-------|
| `'Barker'` | {2, 3, 4, 5, 7, 11, 13} only | PSL = -22.3 dB (length 13). Limited lengths. |
| `'Maximum Length Sequence'` | {7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191} | Good aperiodic properties. Use `mlseq` for standalone generation. |
| `'Quadratic Residue Sequence'` | Must be prime of form 4n-1 | Binary, good periodic autocorrelation. |

### Polyphase Codes

| Code | NumChips Constraint | Notes |
|------|-------------------|-------|
| `'Frank'` | Must be perfect square | Derived from stepped frequency. |
| `'P1'` | Must be perfect square | Similar to Frank, different phase mapping. |
| `'P2'` | Must be even AND perfect square | Symmetric variant of P1. |
| `'P3'` | No constraint | Derived from linear FM. |
| `'P4'` | No constraint | Derived from linear FM (alternate). |
| `'Px'` | Must be perfect square | Extended polyphase code. |
| `'Zadoff-Chu'` | SequenceIndex must be relatively prime to NumChips | Constant amplitude, zero autocorrelation. Widely used in LTE/5G. |

### Custom Code

| Code | Constraint | Notes |
|------|-----------|-------|
| `'Custom'` | Any complex-valued vector via `CustomCode` property | General-purpose container. Accepts IQ, not just phase. |

## Code Selection Guidance

| Requirement | Recommended Code | Typical PSL |
|-------------|-----------------|-------------|
| Deep PSL (< -30 dB) at moderate length | `pnkcode(N, 2, 1)` — P(2,1) polyphase | -35 dB at N=400 |
| Binary only (hardware constraint) | Maximum Length Sequence or Barker | ~-10·log10(N) |
| Low periodic autocorrelation sidelobes | Legendre (`legendreseq`) via Custom | ~-20 dB |
| Constant amplitude + zero periodic AC | Zadoff-Chu | depends on N |
| Maximum flexibility | Custom with `pnkcode`, `legendreseq`, `mlseq`, or `apaseq` | varies |
| Doppler tolerant | Avoid phase-coded — use LFM instead | N/A |
| Short code, moderate sidelobes | Barker (up to length 13) | -22.3 dB |

**Key insight:** For PSL targets below -25 dB, `pnkcode` (polyphase P(n,k)
codes) is the primary choice. Legendre sequences achieve only ~-20 dB at
practical lengths. Binary codes (MLS, Barker) follow PSL ≈ -10·log10(N) — to
reach -35 dB requires N≈3162, which is impractically long.

## Sequence Generation Functions (R2024a)

These functions generate sequences for use with `Code='Custom'`:

| Function | Output | Best For |
|----------|--------|----------|
| `legendreseq(N)` | Length-N Legendre sequence (N must be odd prime) | Perfect periodic autocorrelation |
| `mlseq(N)` | Length-N maximum-length sequence (N must be 2^n - 1, e.g., 7, 15, 31, 63, 127, ...) | Good aperiodic autocorrelation |
| `apaseq(N)` | Length-N almost-perfect autocorrelation sequence (N must be 2*(p+1) where p is prime) | Near-perfect periodic autocorrelation |
| `pnkcode(N, n, k)` | Polyphase P(n,k) code of length N; n = exponent, k = amplitude parameter | Flexible polyphase design |

Example:

```matlab
% CW waveform with Legendre sequence for low sidelobes
seq = legendreseq(127);  % prime length
chipWidth = 1e-6;
prf = 1/(numel(seq) * chipWidth);  % 100% duty cycle
wav = phased.PhaseCodedWaveform( ...
    'Code', 'Custom', ...
    'CustomCode', seq, ...
    'ChipWidth', chipWidth, ...
    'PRF', prf, ...
    'SampleRate', 10e6);
```

## Doppler Sensitivity

Phase-coded waveforms are generally NOT Doppler tolerant. Doppler shift corrupts
the code correlation and raises sidelobes. Longer codes are more sensitive.

**Binary codes are worst:** Doppler tolerance degrades catastrophically with code
length. A length-255 MLS can lose 8+ dB at moderate Doppler shifts. Polyphase
codes (P3, P4, Frank, P(n,k)) degrade more gracefully.

If the application requires both range resolution and Doppler tolerance, prefer
LFM or NLFM waveforms over phase-coded.

## Constraints

- `SampleRate * ChipWidth` must be an integer — each chip must contain a whole
  number of samples. When deriving ChipWidth from bandwidth, fix rounding:
  `chipWidth = round(fs * chipWidth) / fs`
- `SampleRate / PRF` must be an integer (same as all pulsed waveforms)

----

Copyright 2026 The MathWorks, Inc.

----
