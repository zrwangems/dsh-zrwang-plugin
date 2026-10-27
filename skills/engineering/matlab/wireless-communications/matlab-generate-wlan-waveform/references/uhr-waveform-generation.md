# UHR (802.11bn / Wi-Fi 8) Waveform Generation

UHR waveforms use **example helper files**, not built-in toolbox config objects.
Copy the helpers into the same folder as the script using `setupExample`:

```matlab
setupExample("wlan/UHRParameterizationExample", scriptFolder);
```

The script and helpers live in the same working folder, so MATLAB finds them
automatically — no `addpath` needed.

Without the helpers on the path or in the current folder, `uhrMUConfig`,
`uhrTBConfig`, and `uhrWaveformGenerator` are undefined.

**When running interactively** (not from a saved script), copy helpers into
`pwd` with `setupExample("wlan/UHRParameterizationExample", pwd)`.

## Config Objects and API

| UHR | Replaces |
|-----|----------|
| `uhrMUConfig(allocIdx)` | `wlanEHTMUConfig(allocIdx)` |
| `uhrMUConfig("CBW...", 'NumUsers', N)` | `wlanEHTMUConfig("CBW...", NumUsers=N)` |
| `uhrTBConfig` | `wlanEHTTBConfig` |
| `uhrWaveformGenerator(data, cfg)` | `wlanWaveformGenerator(data, cfg)` |

Everything else is the same as EHT: `psduLength(cfg)`, `transmitTime(cfg)`,
`ruInfo(cfg)`, `showAllocation(cfg)`, `wlanSampleRate(cfg.ChannelBandwidth)`,
and the same allocation index scheme as EHT (see
[eht-allocation-indices.md](eht-allocation-indices.md) for full details including
the 20 MHz full-band rule).

## MAC Frame Generation with UHR

`wlanMACFrame` and `wlanMSDULengths` do not accept UHR example helper configs.
Use a non-OFDMA `wlanEHTMUConfig` as a proxy — see
[mac-frame-properties.md](mac-frame-properties.md) for the full workaround and
code example.

## UHR OFDMA Waveform

```matlab
cfg = uhrMUConfig([64 64 64 64]);  % 80 MHz, four 242-tone RUs
cfg.NumTransmitAntennas = 4;

for u = 1:4
    cfg.User{u}.MCS = u + 6;
    cfg.User{u}.NumSpaceTimeStreams = 1;
    cfg.User{u}.APEPLength = 4000;
    cfg.User{u}.ChannelCoding = 'ldpc';
end

for r = 1:numel(cfg.RU)
    cfg.RU{r}.SpatialMapping = 'fourier';
end

psduLens = psduLength(cfg);
txData = cell(1, numel(psduLens));
for u = 1:numel(psduLens)
    txData{u} = randi([0 1], psduLens(u) * 8, 1);
end

waveform = uhrWaveformGenerator(txData, cfg);
```

## UHR Non-OFDMA MU-MIMO

String constructor — no allocation indices needed. Valid bandwidths:
`"CBW20"`, `"CBW40"`, `"CBW80"`, `"CBW160"`, `"CBW320"`.

```matlab
cfg = uhrMUConfig("CBW80", 'NumUsers', 2);
cfg.NumTransmitAntennas = 4;
cfg.User{1}.NumSpaceTimeStreams = 2;
cfg.User{1}.MCS = 9;
cfg.User{1}.APEPLength = 4000;
cfg.User{1}.ChannelCoding = 'ldpc';
cfg.User{2}.NumSpaceTimeStreams = 2;
cfg.User{2}.MCS = 7;
cfg.User{2}.APEPLength = 4000;
cfg.User{2}.ChannelCoding = 'ldpc';
cfg.RU{1}.SpatialMapping = 'fourier';

psduLens = psduLength(cfg);
txData = cell(1, numel(psduLens));
for u = 1:numel(psduLens)
    txData{u} = randi([0 1], psduLens(u) * 8, 1);
end
waveform = uhrWaveformGenerator(txData, cfg);
```

## UEQM (Unequal Modulation) — New in UHR

Per-stream MCS assignment. Set `MCS` to a vector instead of a scalar.

**Constraints:**
- Single user or OFDMA only (not MU-MIMO — multiple users sharing one RU)
- LDPC or LDPC2x channel coding
- 2, 3, or 4 spatial streams
- MCS values must be in 1–13, 17, 19, 20, or 23 (MCS 0, 14, 15 excluded)
- All streams must use the same coding rate
- Constellation size must be non-increasing across streams (highest modulation first)
- Must be a valid pattern from Table 38-33 of 802.11bn/D1.0

**Valid patterns (tested):**

| Streams | MCS Vector | Rate | Modulation |
|---------|-----------|------|------------|
| 2 | `[11 9]` | 5/6 | 1024QAM + 256QAM |
| 2 | `[9 7]` | 5/6 | 256QAM + 64QAM |
| 3 | `[8 6 4]` | 3/4 | 256QAM + 64QAM + 16QAM |
| 4 | `[11 11 11 9]` | 5/6 | 1024QAM×3 + 256QAM |
| 4 | `[8 6 6 4]` | 3/4 | 256QAM + 64QAM×2 + 16QAM |
| 4 | `[13 13 13 11]` | 5/6 | 4096QAM×3 + 1024QAM |

**Invalid (will error):** `[11 5]` (mixed rates 5/6 vs 2/3), `[13 7]` (constellation
gap too large), `[11 11 9 9]` (not a valid 4-stream pattern),
`[9 9 11 11]` (constellation increasing).

```matlab
cfg = uhrMUConfig([64 64 64 64]);
cfg.NumTransmitAntennas = 4;
cfg.User{1}.NumSpaceTimeStreams = 2;
cfg.User{1}.MCS = [11 9];              % 1024QAM + 256QAM (both 5/6)
cfg.User{1}.APEPLength = 4000;
cfg.User{1}.ChannelCoding = 'ldpc';
```

## UHR Trigger-Based Uplink with DRU

UHR TB configuration, DRU rules, valid RU size/DBW combinations, and code
examples are documented in the trigger-based uplink reference (loaded from
SKILL.md).

## UHR ELR (Enhanced Long Range)

Single-user, 20 MHz only, MCS 0 or 1. Designed for extended-range coverage.

```matlab
cfg = uhrELRConfig;
cfg.APEPLength = 200;
cfg.MCS = 0;
cfg.NumTransmitAntennas = 1;

psduLen = psduLength(cfg);
txData = randi([0 1], psduLen * 8, 1);

waveform = uhrWaveformGenerator(txData, cfg);
fprintf('Waveform size: %dx%d\n', size(waveform, 1), size(waveform, 2));
fprintf('Transmit time: %.1f us\n', transmitTime(cfg) * 1e6);
```

**ELR constraints:**
- Fixed **CBW20** bandwidth (read-only)
- **1 spatial stream** (read-only)
- **MCS 0 or 1 only**
- Uses `uhrELRConfig` (not `uhrMUConfig`)
- Uses `uhrWaveformGenerator` for waveform generation (same as other UHR formats)

## LDPC2x and New MCS Values

**LDPC2x** — set `cfg.User{u}.ChannelCoding = 'ldpc2x'` for longer codewords.

**New UHR MCS values** (beyond EHT MCS 0-13):

| MCS | Modulation | Rate | Notes |
|-----|-----------|------|-------|
| 15 | BPSK-DCM | — | Dual carrier modulation |
| 17 | QPSK | 2/3 | |
| 19 | 16QAM | 2/3 | |
| 20 | 16QAM | 5/6 | |
| 23 | 256QAM | 2/3 | |

## Gotchas

1. **`setupExample` is mandatory** — all `uhr*` functions are undefined without the helpers in the working folder or on the path.
2. **UEQM MCS must be decreasing** and match a valid pattern from Table 38-33.
3. **Same allocation indices as EHT** — index 64 = 242-tone (not HE index 192).

----

Copyright 2026 The MathWorks, Inc.
