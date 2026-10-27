# Narrow-Bandwidth Manual DL Config (11-RB carriers)

Common configs like 5 MHz/30 kHz and 10 MHz/60 kHz resolve to just **11 RBs**
(TS 38.104) — too narrow to host the SSB (which needs a >=20-RB carrier at its
own numerology) or the default CORESET, so the no-argument defaults fail on
generation.

**On R2026a+, prefer the simplified constructor** (`nrDLCarrierConfig('FR1', 5, 30)`)
— it builds everything below automatically, so you do not need this reference.

Use the manual build only on **pre-R2026a** releases. The block below reproduces
the constructor's output exactly (verified sample-identical on R2026a), so a
manual build and a constructor build give the same waveform. The SSB rides a
separate **20-RB carrier at the SSB numerology**, and four no-argument defaults
must change: the SSB has no carrier to live on; CORESET `FrequencyResources`
(~48 RB) overflows; PDCCH `AggregationLevel = 8` needs 8 CCEs but a 1-group
CORESET gives 2; and the default `PRBSet = 0:51` overflows the 11-RB BWP.

## 5 MHz / 30 kHz (matches `nrDLCarrierConfig('FR1', 5, 30)`)

```matlab
cfg = nrDLCarrierConfig;
cfg.ChannelBandwidth = 5;

% 5 MHz at 30 kHz -> 11 RBs (TS 38.104 bandwidth table)
cfg.SCSCarriers{1}.SubcarrierSpacing = 30;
cfg.SCSCarriers{1}.NSizeGrid = 11;

% BWP matches the SCS carrier (link the values so they can't drift apart)
cfg.BandwidthParts{1}.SubcarrierSpacing = cfg.SCSCarriers{1}.SubcarrierSpacing;
cfg.BandwidthParts{1}.NSizeBWP = cfg.SCSCarriers{1}.NSizeGrid;

% The default Case A SSB (15 kHz) needs a >=20-RB 15 kHz carrier. NStartGrid = 1
% centers it on the 30 kHz carrier's Point A: 5.5 RB at 30 kHz = 11 RB at
% 15 kHz, minus 20/2 -> 1. The BWP stays on the 30 kHz carrier.
scsSSB = nrSCSCarrierConfig;   % SubcarrierSpacing defaults to 15
scsSSB.NStartGrid = 1;
scsSSB.NSizeGrid = 20;
cfg.SCSCarriers{end+1} = scsSSB;
cfg.SSBurst.TransmittedBlocks = [1 0 0 0];   % constructor transmits one SSB

% CORESET: 6 RBs per set bit; 1 group (6 RBs) is the max that fits 11 RBs.
% Keep Duration at its default 2 — a 1-group CORESET fails at Duration 1.
cfg.CORESET{1}.FrequencyResources = 1;

% Keep a working PDCCH in the narrow band: AggregationLevel 1 (1 CCE) fits.
cfg.SearchSpaces{1}.NumCandidates = [8 0 0 0 0];   % candidates only at AL1
cfg.PDCCH{1}.AggregationLevel = 1;

% PDSCH: fill the BWP. Required — the default 0:51 is invalid for 11 RBs
% (errors through R2026a, silently clips in R2026b), so set it by hand.
cfg.PDSCH{1}.PRBSet = 0:cfg.BandwidthParts{1}.NSizeBWP-1;

[waveform, info] = nrWaveformGenerator(cfg);
```

## 10 MHz / 60 kHz (matches `nrDLCarrierConfig('FR1', 10, 60)`)

Same structure as above with three differences: the data carrier/BWP are
60 kHz; the SSB carrier is **30 kHz with Case B** (FR1 has no 60 kHz SSB); and
the PDCCH must skip the slot the SSB occupies, or generation fails with a
`(PDCCH{1}, SSBurst)` conflict. Build it in full — `nrSCSCarrierConfig` is a
value object, so editing `scsSSB` after appending it does not change `cfg`.

```matlab
cfg = nrDLCarrierConfig;
cfg.ChannelBandwidth = 10;

% 10 MHz at 60 kHz -> 11 RBs (TS 38.104 bandwidth table)
cfg.SCSCarriers{1}.SubcarrierSpacing = 60;
cfg.SCSCarriers{1}.NSizeGrid = 11;
cfg.BandwidthParts{1}.SubcarrierSpacing = cfg.SCSCarriers{1}.SubcarrierSpacing;
cfg.BandwidthParts{1}.NSizeBWP = cfg.SCSCarriers{1}.NSizeGrid;

% SSB on a 20-RB 30 kHz carrier (Case B). NStartGrid = 1 by the same Point A
% centering: 5.5 RB at 60 kHz = 11 RB at 30 kHz, minus 20/2 -> 1.
scsSSB = nrSCSCarrierConfig;
scsSSB.SubcarrierSpacing = 30;
scsSSB.NStartGrid = 1;
scsSSB.NSizeGrid = 20;
cfg.SCSCarriers{end+1} = scsSSB;
cfg.SSBurst.BlockPattern = 'Case B';
cfg.SSBurst.TransmittedBlocks = [1 0 0 0];   % constructor transmits one SSB

cfg.CORESET{1}.FrequencyResources = 1;
cfg.SearchSpaces{1}.NumCandidates = [8 0 0 0 0];
cfg.PDCCH{1}.AggregationLevel = 1;
cfg.PDCCH{1}.Period = 2;   % PDCCH every other 60 kHz slot clears the SSB slot

cfg.PDSCH{1}.PRBSet = 0:cfg.BandwidthParts{1}.NSizeBWP-1;

[waveform, info] = nrWaveformGenerator(cfg);
```

## Variant: single-carrier layout (no SSB carrier)

To keep exactly one SCS carrier, drop the `scsSSB` carrier, the
`BlockPattern`/`TransmittedBlocks` lines, and (10/60) the `PDCCH.Period` line,
and disable the SSB instead. The waveform then has no
SS burst, so it differs from the constructor's output — use this only when the
task asks for a single carrier or no SSB.

```matlab
cfg.SSBurst.Enable = false;   % no 20-RB SSB carrier in a single 11-RB layout
```

Copyright 2026 The MathWorks, Inc.
