# HE-MU (802.11ax) Allocation Index Reference

`wlanHEMUConfig(allocIdx)` takes allocation indices, not RU sizes. The number
of indices determines bandwidth: 1→20 MHz, 2→40 MHz, 4→80 MHz, 8→160 MHz.

## Per-20-MHz Subchannel Indices (0-223)

### OFDMA Layouts (no MU-MIMO)

| Index | RU Layout | Users |
|-------|-----------|-------|
| 0 | 26x9 | 9 |
| 112 | 52x4 | 4 |
| 96 | 106+106 | 2 |
| 128 | 106+26+106 | 3 |

### MU-MIMO on 106-tone RUs (indices 96-111)

Each 106-tone RU supports 1-4 MU-MIMO users.
Formula: `96 + 4*(usersRU1 - 1) + (usersRU2 - 1)`

| Index | Users per RU | Total Users |
|-------|-------------|-------------|
| 96 | [1, 1] | 2 |
| 97 | [1, 2] | 3 |
| 100 | [2, 1] | 3 |
| 101 | [2, 2] | 4 |
| 111 | [4, 4] | 8 |

### MU-MIMO on 106+26+106 (indices 128-191)

Two 106-tone RUs (1-8 MU-MIMO users each) + center 26-tone (always 1 user).
Formula: `128 + 8*(usersRU1 - 1) + (usersRU3 - 1)`

| Index | Users per RU [106, 26, 106] | Total Users |
|-------|----------------------------|-------------|
| 128 | [1, 1, 1] | 3 |
| 129 | [1, 1, 2] | 4 |
| 136 | [2, 1, 1] | 4 |
| 191 | [8, 1, 8] | 17 |

**Special indices in the 113-115 range:**

| Index | Meaning |
|-------|---------|
| 113 | Preamble-punctured subchannel (no preamble or data transmitted) |
| 114 | 484-tone RU present on this subchannel, 0 users on this content channel |
| 115 | 996-tone RU present on this subchannel, 0 users on this content channel |

Indices 116-127 are reserved.

### Mixed OFDMA + MU-MIMO on 106-tone (indices 16-95)

Within each group of 8, `base + K` gives K+1 MU-MIMO users on the 106-tone RU:

| Base | Layout | Index Range |
|------|--------|-------------|
| 16 | 52+52+**106** | 16-23 |
| 24 | **106**+52+52 | 24-31 |
| 32 | 26x5+**106** | 32-39 |
| 64 | **106**+26x5 | 64-71 |
| 88 | **106**+26+52+52 | 88-95 |

### Full-Band RU Indices

| Base Index | RU Size | Bandwidth | Index Range |
|------------|---------|-----------|-------------|
| 192 | 242-tone | 20 MHz | 192-199 |
| 200 | 484-tone | 40 MHz | 200-207 |
| 208 | 996-tone | 80 MHz | 208-215 |
| 216 | 1992-tone | 160 MHz | 216-223 |

For 242-tone (single subchannel): `users = index - 191`.

**Multi-subchannel RUs (484, 996, 1992):** Each subchannel carries its own
allocation index that independently signals users on that **content channel**.
The total users on the RU is the sum across content channels.

For 484-tone: `users_on_this_CC = index - 199`. Use index 114 for 0 users on
a content channel. The two subchannels do **not** need the same index.

For 996-tone: `users_on_this_CC = index - 207`. Use index 115 for 0 users.

**Example: 484-tone RU with 4 total MU-MIMO users (5 ways):**

| Allocation Index | Users CC1 | Users CC2 | Total |
|-----------------|-----------|-----------|-------|
| `[200 202]` | 1 | 3 | 4 |
| `[201 201]` | 2 | 2 | 4 |
| `[202 200]` | 3 | 1 | 4 |
| `[203 114]` | 4 | 0 | 4 |
| `[114 203]` | 0 | 4 | 4 |

## Common Configurations

### 20 MHz: One 242-tone RU (1 user)
```matlab
cfg = wlanHEMUConfig(192);
```

### 20 MHz: One 242-tone RU (2 MU-MIMO users)
```matlab
cfg = wlanHEMUConfig(193);
```

### 20 MHz: Two 106-tone RUs (2 users)
```matlab
cfg = wlanHEMUConfig(96);
```

### 40 MHz: Two 242-tone RUs (1 user each)
```matlab
cfg = wlanHEMUConfig([192 192]);
```

### 40 MHz: One 484-tone RU (1 user)
```matlab
cfg = wlanHEMUConfig([200 114]);
```

### 40 MHz: One 484-tone RU (4 MU-MIMO users, 2+2 per CC)
```matlab
cfg = wlanHEMUConfig([201 201]);
```

### 80 MHz: Four 242-tone RUs (1 user each)
```matlab
cfg = wlanHEMUConfig([192 192 192 192]);
```

### 80 MHz: Two 484-tone RUs (1 user each)
```matlab
cfg = wlanHEMUConfig([200 114 200 114]);
```

### 80 MHz: 484-tone (4 users) + 242-tone + 106+106
```matlab
cfg = wlanHEMUConfig([201 201 192 96]);
```

### 80 MHz: One 996-tone RU (1 user)
```matlab
cfg = wlanHEMUConfig([208 115 115 115]);
```

### 160 MHz: 242-tone RUs with SC2 punctured
```matlab
cfg = wlanHEMUConfig([192 113 192 192 192 192 192 192]);
```

### 80 MHz: Mixed — 242-tone on SC1, two 106-tone on SC2, 484-tone on SC3-4
```matlab
cfg = wlanHEMUConfig([192 96 200 114]);
```

## Notes

- `ChannelBandwidth` is **read-only** — inferred from the index vector length.
- Per-user config: `cfg.User{u}.MCS`, `cfg.User{u}.APEPLength`, etc.
- Per-RU config: `cfg.RU{r}.SpatialMapping`, `cfg.RU{r}.PowerBoostFactor`.
- Use `ruInfo(cfg)` to verify: returns struct with `RUSizes` (numeric array),
  `RUIndices`, `NumRUs`, `NumUsers`.
- `getPSDULength(cfg)` returns a vector of PSDU lengths (one per user).
- `transmitTime(cfg)` returns the packet duration in seconds.

----

Copyright 2026 The MathWorks, Inc.
