# EHT-MU (802.11be) Allocation Index Reference

`wlanEHTMUConfig(allocIdx)` takes per-20-MHz-subchannel allocation indices.
For 80 MHz, provide a 4-element vector. For 160 MHz, provide an 8-element vector.
Valid ranges: 0-25 (per-subchannel), 26-27 (puncturing), 28-30 (continuation),
32-55 (per-subchannel MRU), 64-87 (full-band), 96-127 (large RU/MRU for 80 MHz),
144-151 (large MRU for 160 MHz).

## Continuation Indices

When an RU or MRU spans multiple subchannels, use continuation indices on
the additional subchannels:

| Index | Meaning |
|-------|---------|
| 28 | Subchannel is part of a 242-tone allocation |
| 29 | Subchannel is part of a 484-tone allocation |
| 30 | Subchannel is part of a 996-tone allocation |

## Puncturing Indices

| Index | Meaning |
|-------|---------|
| 26 | Punctured subchannel (no preamble or data) |
| 27 | Punctured subchannel (alternate encoding) |

Use index **26** in the allocation vector to fully puncture a 20 MHz subchannel.
This is different from HE, which uses index 113 for puncturing.

```matlab
% 160 MHz with SC2, SC6, SC7 punctured
cfg = wlanEHTMUConfig([64 26 64 64 64 26 26 64]);
```

## Per-20-MHz Subchannel Indices (0-25)

| Index | RU Layout | Users |
|-------|-----------|-------|
| 0 | 26+26+26+26+26+26+26+26+26 | 9 |
| 1 | 26+26+26+26+26+26+26+52 | 8 |
| 6 | 26+26+52+26+52+26+26 | 7 |
| 7 | 26+26+52+26+52+52 | 6 |
| 15 | 52+52+26+52+52 | 5 |
| 16 | 26+26+26+26+26+106 | 6 |
| 20 | 106+26+26+26+26+26 | 6 |
| 24 | 52+52+52+52 | 4 |
| 25 | 106+26+106 | 3 |

## Per-20-MHz MRU Indices (32-55)

These indices produce Multi-Resource Units — non-contiguous tone blocks.

| Index | RU Layout | Users | MRU Detail |
|-------|-----------|-------|------------|
| 40 | 26+26+26+26+[26 106] | 5 | [26+106] MRU |
| 43 | 52+52+[26 106] | 3 | [26+106] MRU |
| 44 | [106 26]+26+26+26+26 | 5 | [106+26] MRU |
| 47 | [106 26]+52+52 | 3 | [106+26] MRU |
| 48 | [106 26]+106 | 2 | [106+26] MRU + 106 |
| 50 | 106+[26 106] | 2 | 106 + [26+106] MRU |

## Full-Band Indices

**Full-band indices (64+) cannot be used for 20 MHz.** A 242-tone RU IS the
full 20 MHz band, making it a single-user or full-band MU-MIMO configuration.
For both of these, use the string constructor: `wlanEHTMUConfig("CBW20")` or
`uhrMUConfig("CBW20")`. Use index 64+ only in multi-subchannel vectors for
wider bandwidths (e.g., `[64 64 64 64]` for 80 MHz).

### 242-tone (indices 64-71, per subchannel)

Users per RU = `index - 63`.

```matlab
cfg = wlanEHTMUConfig([64 64 64 64]);  % 80 MHz, 4x242-tone, 1 user each
cfg = wlanEHTMUConfig([65 65 65 65]);  % 80 MHz, 4x242-tone, 2 MU-MIMO each
```

### 484-tone (indices 72-79, spans 2 subchannels)

Uses continuation index 29. Users per RU = `index - 71`.

```matlab
cfg = wlanEHTMUConfig([72 29]);          % 40 MHz, 484-tone, 1 user
cfg = wlanEHTMUConfig([72 29 72 29]);    % 80 MHz, 2x484-tone, 1 user each
```

### 996-tone (indices 80-87, spans 4 subchannels)

Uses continuation index 30. Users per RU = `index - 79`.

```matlab
cfg = wlanEHTMUConfig([80 30 30 30]);    % 80 MHz, 996-tone, 1 user
cfg = wlanEHTMUConfig([81 30 30 30]);    % 80 MHz, 996-tone, 2 users
```

### 484+242 MRU (indices 96-127, spans 3 subchannels in 80 MHz)

There are **four variants** depending on which subchannels carry the 484 and
242 parts. Each variant leaves one subchannel free for an independent
allocation.

| Range | Layout | MRU Subchannels | Independent SC | Mixed Pattern |
|-------|--------|----------------|---------------|---------------|
| 96-103 | 242+484 | SC2(242) + SC3,SC4(484) | **SC1** | `[25 28 96 29]` |
| 104-111 | 242+484 | SC1(242) + SC3,SC4(484) | **SC2** | `[28 25 104 29]` |
| 112-119 | 484+242 | SC1,SC2(484) + SC4(242) | **SC3** | `[112 29 25 28]` |
| 120-127 | 484+242 | SC1,SC2(484) + SC3(242) | **SC4** | `[120 29 28 25]` |

The independent subchannel uses any valid per-subchannel index (0-25, 32-55,
or 64-71). In the mixed patterns above, 25 = 106+26+106 layout.

**Full-MRU patterns** (no independent subchannel, MU-MIMO users on the MRU):

| Range | Full-MRU Pattern | Users |
|-------|-----------------|-------|
| 96-103 | `[96 28 96 96]` | `(index - 95) * 3` |
| 104-111 | `[28 104 104 104]` | `(index - 103) * 3` |
| 112-119 | `[112 112 112 28]` | `(index - 111) * 3` |
| 120-127 | `[120 120 28 120]` | `(index - 119) * 3` |

```matlab
% 484+242 MRU on SC1+SC2+SC4, independent 106+26+106 on SC3
cfg = wlanEHTMUConfig([112 29 25 28]);  % SC3 independent
```

```matlab
% 484+242 MRU on SC1+SC2+SC3, independent 106+26+106 on SC4
cfg = wlanEHTMUConfig([120 29 28 25]);  % SC4 independent
```

### 996+484 MRU (indices 144-151, 160 MHz only)

For 160 MHz, a 996+484 MRU spans 6 of the 8 subchannels. The 996-tone part
uses continuation index 30, the 484-tone part uses continuation index 29.
The remaining 2 subchannels are independent.

Users per MRU = `index - 143`. Index 144 = 1 user, 151 = 8 users.

```matlab
% 160 MHz: 996+484 MRU (8 users) + two 242-tone RUs
cfg = wlanEHTMUConfig([151 30 30 30 64 64 29 29]);
```

In this layout: SC1-4 carry the 996-tone part (index 151 + three 30s), SC5-6
are independent 242-tone RUs (index 64), and SC7-8 carry the 484-tone part
(two 29s).

**160 MHz allocation vectors** are 8 elements (one per 20 MHz subchannel).
`wlanEHTMUConfig` expands a 1x8 vector to a 2x8 AllocationIndex matrix
(two content channels).

## Common Configurations

### 80 MHz: Four 242-tone RUs (1 user each)
```matlab
cfg = wlanEHTMUConfig([64 64 64 64]);
```

### 80 MHz: Two 484-tone RUs
```matlab
cfg = wlanEHTMUConfig([72 29 72 29]);
```

### 80 MHz: One 996-tone RU (1 user)
```matlab
cfg = wlanEHTMUConfig([80 30 30 30]);
```

### 80 MHz: 484+242 MRU (1 user) + 106+26+106 on subchannel 4
```matlab
cfg = wlanEHTMUConfig([120 29 28 25]);
```

### 40 MHz: One 484-tone (1 user)
```matlab
cfg = wlanEHTMUConfig([72 29]);
```

### 160 MHz: 242-tone RUs with punctured subchannels
```matlab
cfg = wlanEHTMUConfig([64 26 64 64 64 26 26 64]);  % SC2, SC6, SC7 punctured
```

### 160 MHz: 996+484 MRU (8 users) + two 242-tone
```matlab
cfg = wlanEHTMUConfig([151 30 30 30 64 64 29 29]);
```

## Key Differences from HE

- **MRU support:** EHT indices 32-55 produce MRUs (non-contiguous tone blocks).
  HE has no MRUs.
- **`ruInfo` returns cell arrays:** `ri.RUSizes{r}` can be a vector for MRUs
  (e.g., `[484 242]`). HE `ruInfo` returns numeric arrays.
- **PSDU length method:** Use `psduLength(cfg)`, NOT `getPSDULength(cfg)`.
- **Non-OFDMA mode:** `wlanEHTMUConfig("CBW80", NumUsers=N)` creates a single
  full-bandwidth RU with N MU-MIMO users (no allocation index needed). Valid
  bandwidths: `"CBW20"`, `"CBW40"`, `"CBW80"`, `"CBW160"`, `"CBW320"`. Max 8 users.

## Construction-Time-Only Properties

These `wlanEHTMUConfig` properties are **read-only after construction**. They
must be passed as name-value pairs in the constructor call. Attempting to set
them after construction errors with "Unable to set ... because it is read-only."

| Property | Purpose | Valid Values | Example |
|----------|---------|-------------|---------|
| `EHTDUPMode` | Enable EHT DUP mode | `true` / `false` | `wlanEHTMUConfig("CBW80", EHTDUPMode=true)` |
| `PuncturedChannelFieldValue` | Puncture subchannel (non-OFDMA) | 0–4 (80 MHz), 0–24 (wider) | `wlanEHTMUConfig("CBW80", NumUsers=2, PuncturedChannelFieldValue=3)` |
| `NumUsers` | Number of MU-MIMO users (non-OFDMA) | 1–8 | `wlanEHTMUConfig("CBW160", NumUsers=4)` |

### PuncturedChannelFieldValue Mapping (80 MHz)

| Value | PuncturingPattern | Meaning |
|-------|-------------------|---------|
| 0 | `[0 0 0 0]` | No puncturing |
| 1 | `[1 0 0 0]` | Subchannel 1 punctured |
| 2 | `[0 1 0 0]` | Subchannel 2 punctured |
| 3 | `[0 0 1 0]` | Subchannel 3 punctured |
| 4 | `[0 0 0 1]` | Subchannel 4 punctured |

### EHT DUP Mode Constraints

EHT DUP duplicates the signal across subchannels. Strict requirements:
- **MCS 14** (BPSK-DCM) — only valid MCS
- **Single user**, **1 spatial stream**
- **No puncturing**
- **80, 160, or 320 MHz** only

```matlab
cfg = wlanEHTMUConfig("CBW160", EHTDUPMode=true);
cfg.NumTransmitAntennas = 1;
cfg.User{1}.MCS = 14;
cfg.User{1}.NumSpaceTimeStreams = 1;
cfg.User{1}.APEPLength = 500;
cfg.User{1}.ChannelCoding = 'ldpc';

psduLen = psduLength(cfg);
txData = randi([0 1], psduLen * 8, 1);
waveform = wlanWaveformGenerator(txData, cfg);
```

### Non-OFDMA Puncturing Example

```matlab
% 80 MHz MU-MIMO, 2 users, subchannel 3 punctured
cfg = wlanEHTMUConfig("CBW80", NumUsers=2, PuncturedChannelFieldValue=3);
cfg.NumTransmitAntennas = 4;
cfg.User{1}.NumSpaceTimeStreams = 2;
cfg.User{1}.MCS = 9;
cfg.User{1}.APEPLength = 4000;
cfg.User{1}.ChannelCoding = 'ldpc';
cfg.User{2}.NumSpaceTimeStreams = 2;
cfg.User{2}.MCS = 7;
cfg.User{2}.APEPLength = 4000;
cfg.User{2}.ChannelCoding = 'ldpc';

psduLens = psduLength(cfg);
txData = cell(1, numel(psduLens));
for u = 1:numel(psduLens)
    txData{u} = randi([0 1], psduLens(u) * 8, 1);
end
waveform = wlanWaveformGenerator(txData, cfg);
```

## Notes

- Per-user config: `cfg.User{u}.MCS`, `cfg.User{u}.APEPLength`, etc.
- Per-RU config: `cfg.RU{r}.SpatialMapping`.
- Use `showAllocation(cfg)` to visualize the RU layout.
- Max PPDU duration: 5484 μs. Small RUs (26-tone) with large APEPLength will
  exceed this — reduce APEPLength for small RUs.

----

Copyright 2026 The MathWorks, Inc.
