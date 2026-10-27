# Worked Waveform Patterns

Copy-ready examples for common single-carrier waveforms. For narrow-band
(11-RB) layouts see
[narrow-band-manual-config.md](narrow-band-manual-config.md); for multi-BWP see
[multi-bwp-guidance.md](multi-bwp-guidance.md); for test models and FRCs see
[test-models-and-frc.md](test-models-and-frc.md).

## Basic DL Waveform

```matlab
% 20 MHz, 30 kHz SCS downlink waveform with 64QAM PDSCH
cfg = nrDLCarrierConfig('FR1', 20, 30);
cfg.PDSCH{1}.Modulation = '64QAM';       % non-default (the default is QPSK)

[waveform, info] = nrWaveformGenerator(cfg);

% Plot resource grid. SSBurst (enabled by default) lives in a SEPARATE
% grid, so plot both the BWP data grid and the SS burst.
figure; tiledlayout(1,2);
nexttile; imagesc(abs(info.ResourceGrids(1).ResourceGridBWP(:,:,1)));
axis xy; xlabel('OFDM Symbols'); ylabel('Subcarriers'); title('DL Resource Grid (BWP)'); colorbar;
nexttile; imagesc(abs(info.ResourceGridSSBurst.ResourceGrid(:,:,1)));
axis xy; xlabel('OFDM Symbols'); ylabel('Subcarriers'); title('SS Burst Grid'); colorbar;
```

## Basic UL Waveform

```matlab
% 20 MHz, 15 kHz SCS uplink waveform with QPSK PUSCH
cfg = nrULCarrierConfig('FR1', 20, 15);
cfg.PUSCH{1}.Modulation = 'QPSK';         % explicit per request (also the default)

[waveform, info] = nrWaveformGenerator(cfg);
```

## Plot the Power Spectrum

For the power spectrum (rather than the resource grid), pass the waveform and
its sample rate to `pspectrum` — `sr` puts the frequency axis in real Hz:

```matlab
sr = info.ResourceGrids(1).Info.SampleRate;
figure;
pspectrum(waveform(:,1), sr);   % first antenna; sr -> Hz frequency axis
title('5G NR Waveform Power Spectrum');
```

`spectrumAnalyzer` and `pwelch` also work; all need the sample rate.

Copyright 2026 The MathWorks, Inc.
