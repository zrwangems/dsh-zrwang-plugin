# Trigger-Based (TB) Uplink Waveform

TB waveforms represent a single STA's uplink transmission on its assigned RU.
Use `RUSize` and `RUIndex` properties (not allocation indices). For MRU, pass
vectors.

## HE TB

```matlab
cfg = wlanHETBConfig;
cfg.ChannelBandwidth = 'CBW80';
cfg.RUSize = 242;
cfg.RUIndex = 1;                    % Must match ruInfo(cfgMU).RUIndices
cfg.NumTransmitAntennas = 1;
cfg.NumSpaceTimeStreams = 1;
cfg.MCS = 7;
cfg.ChannelCoding = 'LDPC';

psdu = getPSDULength(cfg);
bits = randi([0 1], psdu * 8, 1);
waveform = wlanWaveformGenerator(bits, cfg);
```

## EHT TB

```matlab
% EHT TB: single user on a 242+484 MRU
cfg = wlanEHTTBConfig;
cfg.ChannelBandwidth = 'CBW80';
cfg.RUSize = [242 484];             % MRU: vector of component RU sizes
cfg.RUIndex = [1 2];                % Must match ruInfo(cfgMU).RUIndices
cfg.MCS = 7;
cfg.NumSpaceTimeStreams = 1;
cfg.ChannelCoding = 'LDPC';

psdu = psduLength(cfg);
bits = randi([0 1], psdu * 8, 1);
waveform = wlanWaveformGenerator(bits, cfg, 'OversamplingFactor', 1.5);
fs = wlanSampleRate(cfg) * 1.5;
```

## UHR TB (with DRU)

UHR TB requires example helpers on the path (see
[uhr-waveform-generation.md](uhr-waveform-generation.md)).

Distributed Resource Units (DRU) spread subcarriers across a wider bandwidth
for frequency diversity. New in UHR.

```matlab
cfgMU = uhrMUConfig([64 64 64 64]);
info = ruInfo(cfgMU);

cfgTB = uhrTBConfig;
cfgTB.ChannelBandwidth = 'CBW80';
cfgTB.RUSize = 106;
cfgTB.RUIndex = info.RUIndices{1};
cfgTB.NumTransmitAntennas = 2;
cfgTB.NumSpaceTimeStreams = 2;
cfgTB.NumUHRLTFSymbols = 2;         % Must be >= NumSpaceTimeStreams
cfgTB.MCS = 7;
cfgTB.ChannelCoding = 'ldpc';
cfgTB.DRU = true;
cfgTB.DistributionBandwidth = 'DBW20';

psduLen = psduLength(cfgTB);
txData = randi([0 1], psduLen * 8, 1);
waveform = uhrWaveformGenerator(txData, cfgTB);
```

### DRU Rules

| ChannelBandwidth | DistributionBandwidth | Valid RU sizes |
|-----------------|----------------------|----------------|
| CBW20 | DBW20 (only option) | 26, 52, 106 |
| CBW40 | DBW40 (only option) | 26, 52, 106, 242 |
| CBW80/160/320 | DBW20 | 26, 52, 106 |
| CBW80/160/320 | DBW40 | 26, 52, 106, 242 |
| CBW80/160/320 | DBW80 | 52, 106, 242, 484 |

Max 2 spatial streams for DRU.

## Important TB Rules

- **`RUIndex` must match `ruInfo` indices from the corresponding MU config.**
  Query `ruInfo(cfgMU).RUIndices` — sequential numbering may overlap subcarriers.
- **LTF symbols >= total STS** across all users sharing the RU:
  - HE: `NumHELTFSymbols`
  - EHT: `NumEHTLTFSymbols`
  - UHR: `NumUHRLTFSymbols`
- **PSDU length method matches the format:** HE uses `getPSDULength(cfg)`,
  EHT/UHR use `psduLength(cfg)`.
- **Oversampling:** Pass `'OversamplingFactor'` to `wlanWaveformGenerator` and `wlanSampleRate(cfg)`.
- To simulate combined AP-receive, generate each STA's TB waveform independently,
  zero-pad to equal length, and sum.
- **UHR DRU property is `DRU`**, not `DistributedRU`.

----

Copyright 2026 The MathWorks, Inc.
