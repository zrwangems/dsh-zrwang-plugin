# Common Mistakes Reference

| Mistake | Why It's Wrong | Correct Approach |
|---------|---------------|-----------------|
| Using `nlfmspec2freq` with `phased.NonlinearFMWaveform` | `NonlinearFMWaveform` has 4 fixed built-in types with their own parameters — cannot accept arbitrary frequency profiles | Use `nlfmspec2freq` with `phased.CustomFMWaveform` |
| Using `shapespectrum` to reduce sidelobes | `shapespectrum` is for spectral notching and applying masks to avoid interference | Use windowed matched filter or NLFM for sidelobe control |
| Claiming no NLFM waveform object exists | Two objects exist | `phased.NonlinearFMWaveform` (4 built-in types) and `phased.CustomFMWaveform` (arbitrary) |
| Building Legendre/MLS sequences from scratch | Functions exist since R2024a | Use `legendreseq`, `mlseq`, `apaseq` |
| Using `ambgfun` for CW waveform Doppler analysis | Misses the periodicity advantage | Use `pambgfun` for CW/periodic waveforms |
| Recommending Pulse Waveform Analyzer app | Deprecated / not preferred | Recommend `radarWaveformGenerator` app |
| Saying `CustomCode` only accepts phase values | It accepts arbitrary complex (IQ) vectors | `phased.PhaseCodedWaveform` with `CustomCode` is a general waveform container |
| Setting `SweepDirection='Triangle'` on `LinearFMWaveform` | Only supports `'Up'` and `'Down'` | Triangle sweep is exclusive to `phased.FMCWWaveform` |
| Setting `NumChips` when using `Code='Custom'` | `NumChips` is irrelevant for Custom code — inferred from vector length; setting it produces a warning | Omit `NumChips`; only set `CustomCode`, `ChipWidth`, `PRF`, `SampleRate` |
| Passing linear magnitude to `sidelobelevel` | Input must be in dB; passing `abs(sig)` gives wrong results | Use `sidelobelevel(mag2db(abs(mfOut)))` |
| Calling `getMatchedFilter` on CW objects (`FMCWWaveform`, `MFSKWaveform`) | CW objects do not have this method — they use different processing | FMCW: use dechirp/stretch processing. MFSK: use beat frequency + phase difference |
| Setting `DutyCycle = 1` for CW operation | Errors on all pulsed objects ("Expected PulseWidth to be a scalar with value < 1") | Set `PRF = 1/PulseWidth` to achieve 100% duty cycle |
| Using PRF values where `SampleRate/PRF` is not integer | Each PRI must contain an integer number of samples; non-integer ratio errors | Choose PRF values that evenly divide the SampleRate |
| Calling `mlseq(n)` expecting length 2^n-1 | `mlseq` takes the sequence length N directly, not the exponent | Call `mlseq(127)` for length-127 sequence (N must be 2^n - 1) |
| Using `speed2dop` directly as radar Doppler | `speed2dop` returns one-way Doppler; radar is two-way | Use `2 * speed2dop(velocity, lambda)` for max Doppler |
| Measuring PSL with low sample rate (< 8× BW) | Insufficient samples in mainlobe causes `sidelobelevel` to report wrong PSL | Set `SampleRate >= 8 * bandwidth` before measuring sidelobes |
| Non-integer `SampleRate * ChipWidth` for phase-coded | Each chip must contain an integer number of samples; non-integer errors | Compute `chipWidth = round(fs * chipWidth) / fs` to fix |
| Using `legendreseq` for deep PSL (< -25 dB) | Legendre sequences only achieve ~-20 dB PSL at practical lengths | Use `pnkcode(N, n, k)` for PSL < -30 dB (e.g., P(2,1)-400 gives -35 dB) |
| Using binary codes (MLS, Barker) for deep PSL | Binary PSL ≈ -10·log10(N); need N≈3162 for -35 dB (impractical PW). Doppler tolerance also degrades catastrophically with length | Use polyphase codes (P(n,k), Frank, P3/P4) or FM waveforms |
| Setting `PolynomialCoefficients` to `[1, 0, 0]` expecting LFM | `polyval` uses descending powers: `[1,0,0]` = n², which is quadratic. The last element is the constant term, removed by normalization | LFM equivalent is `[0, 1, 0]`. To perturb, vary leading terms: `[a3, 0, 1, 0]` |
| Passing only the pulse portion to `ambgfun` | `ambgfun` requires at least `fs/prf` samples (one full PRI); pulse-only signal errors | Pass the full waveform object output: `sig = wf();` which includes trailing zeros |
| Using `shapespectrum('Taylor', ...)` to design NLFM | `shapespectrum` does not accept window type strings — it takes a desired spectrum vector and shapes an existing waveform to match it | Use `taylorwin(N, nbar, sll)` → `nlfmspec2freq(bw, spectrum)` → `CustomFMWaveform` |

----

Copyright 2026 The MathWorks, Inc.

----
