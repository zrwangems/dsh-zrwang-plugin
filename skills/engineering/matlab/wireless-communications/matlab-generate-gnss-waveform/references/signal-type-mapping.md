# GNSS Signal Type Mapping

Quick reference for configuring waveform generators and nav data encoding
for GPS, Galileo, and NavIC signal types.

## GPS Signal Types

| GPS Signal | `SignalType` | `navDataType` | Center Freq (MHz) | `BitDuration` (ms) |
|------------|-------------|---------------|-------------------|-------------------|
| L1 C/A | `"legacy"` | `"LNAV"` | 1575.42 | 20 |
| L1C | `"l1C"` | `"CNAV2"` | 1575.42 | 10 |
| L2C | `"l2c"` | `"CNAV"` | 1227.60 | 20 |
| L5 | `"l5"` | `"L5"` | 1176.45 | 10 |

### GPS Nav Data Sizes

| `navDataType` | Rows per satellite | Structure |
|---------------|-------------------|-----------|
| `"LNAV"` | 37500 | 25 frames x 5 subframes x 300 bits |
| `"CNAV2"` | 88200 | Larger message structure |
| `"CNAV"` | 18000 | Compact nav message |
| `"L5"` | 18000 | Same structure as CNAV |

## Galileo Signal Types

| Galileo Signal | `SignalType` | Center Freq (MHz) | `BitDuration` (ms) | Notes |
|---------------|-------------|-------------------|-------------------|-------|
| E1 | `"E1"` | 1575.42 | 4 | I/NAV data |
| E1C | `"E1C"` | 1575.42 | 4 | Pilot only (no nav data) |
| E5a | `"E5a"` | 1176.45 | 20 | F/NAV data |
| E5b | `"E5b"` | 1207.14 | 4 | I/NAV data |
| E5 | `"E5"` | 1191.795 | 20 | Wideband AltBOC (F/NAV + I/NAV cell) |

Galileo nav data is encoded via `HelperGalileoNavigationData.navdata2bits()`,
not through a separate navDataType parameter. **E5 requires a cell array
input** `{fnavbits, inavbits}` — see `galileo-pipeline.md` E5 section.

## NavIC Signal Types

| NavIC Signal | Frequency Band | Center Freq (MHz) | Step Time (ms) | Modulation |
|-------------|---------------|-------------------|---------------|------------|
| L5 SPS | L5 | 1176.45 | 20 | BOC(1,1) + C/A |
| S SPS | S-band | 2492.028 | 20 | BOC(1,1) + C/A |
| L1 SPS | L1 | 1575.42 | 10 | SBOC + IZ4 codes (from .mat file) |

NavIC has no system object in R2026a -- uses manual `interplexmod` + `bocmod`
+ `gnssCACode`. The `navicWaveformGenerator` ships in R2026b.

**NavIC L1 SPS limitation:** `gnssCACode` does NOT support L1. L1 requires
downloading support files first — see `references/navic-pipeline.md` §NavIC L1 SPS.

## Transmit Power by Constellation

| Constellation | Transmit Power (W) | Use in SNR calculation |
|--------------|-------------------|----------------------|
| GPS | 44.8 | `Pt = 44.8` |
| Galileo | 160 | `Pt = 160` |
| NavIC | 50 | `Pt = 50` |

Copyright 2026 The MathWorks, Inc.
