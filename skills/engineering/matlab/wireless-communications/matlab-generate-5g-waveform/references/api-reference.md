# API Reference

Canonical function/class names and the output structure for
`nrWaveformGenerator`. If you need to verify property names, check valid values
for a config object, or look up parameters not covered here, consult the online
documentation links in [documentation-links.md](documentation-links.md).

## Key Functions

| Function / Class | Purpose |
|-----------------|---------|
| `nrWaveformGenerator` | Generate time-domain waveform from carrier config |
| `nrDLCarrierConfig` | DL carrier config (wraps all DL channels) |
| `nrULCarrierConfig` | UL carrier config (wraps all UL channels) |
| `nrSCSCarrierConfig` | SCS carrier: `SubcarrierSpacing`, `NSizeGrid`, `NStartGrid` |
| `nrWavegenBWPConfig` | BWP: `SubcarrierSpacing`, `NSizeBWP`, `NStartBWP` |
| `nrWavegenPDSCHConfig` | PDSCH: `Modulation`, `Power`, `DMRSPower`, `PRBSet` |
| `nrWavegenPUSCHConfig` | PUSCH: `Modulation`, `Power`, `DMRSPower` |
| `nrWavegenPUCCH0Config` .. `nrWavegenPUCCH4Config` | PUCCH formats 0–4 |
| `nrWavegenSRSConfig` | SRS config |
| `nrWavegenPDCCHConfig` | PDCCH config (links via `SearchSpaceID`) |
| `nrCORESETConfig` | CORESET: `FrequencyResources`, `Duration` |
| `nrSearchSpaceConfig` | Links PDCCH to CORESET via IDs |
| `nrWavegenSSBurstConfig` | SS burst: `BlockPattern`, `TransmittedBlocks` |
| `nrWavegenCSIRSConfig` | CSI-RS config |
| `hNRReferenceWaveformGenerator` | Standard TMs and FRCs (example helper) |
| `validateConfig` | Check structural rules (method on carrier config) |
| `openInGenerator` | Open config in 5G Waveform Generator app |

**DM-RS power note:** `Power` and `DMRSPower` (dB) are optional. `DMRSPower` is
DM-RS power relative to data REs; per TS 38.214 Table 4.1-1 it is boosted 0, 3,
or 4.77 dB for 1, 2, or 3 CDM groups without data (R2026b+ applies this
automatically when `DMRSPower = []`).

## Do Not Mix API Levels

These primitive objects are incompatible with `nrWaveformGenerator`:

| Use with `nrWaveformGenerator` | Do not use with `nrWaveformGenerator` |
|-------------------------------|--------------------------------------|
| `nrDLCarrierConfig` / `nrULCarrierConfig` | `nrCarrierConfig` |
| `nrWavegenPDSCHConfig` | `nrPDSCHConfig` |
| `nrWavegenPUSCHConfig` | `nrPUSCHConfig` |

Do not use primitive-level functions (`nrCarrierConfig` + `nrPDSCH` +
`nrOFDMModulate`) for waveform generation — those are for individual channel
signal processing, not waveform construction. `nrWaveformGenerator` handles
channel multiplexing, power scaling, and OFDM modulation correctly.

## Output Structure

`[waveform, info] = nrWaveformGenerator(cfg)` returns:

| Field | Contents |
|-------|----------|
| `waveform` | Complex time-domain samples (N x P, P = antennas) |
| `info.ResourceGrids(k).ResourceGridBWP` | Grid sized to BWP (NSizeBWP*12 subcarriers) |
| `info.ResourceGrids(k).ResourceGridInCarrier` | Grid sized to full carrier |
| `info.ResourceGrids(k).Info.SampleRate` | Waveform sample rate |
| `info.ResourceGridSSBurst.ResourceGrid` | SSB grid (DL only) |
| `info.WaveformResources.PDSCH` | Per-slot PDSCH resources (indices, symbols) |

**There is no field called `ResourceGrid` in `info.ResourceGrids`.** Use
`ResourceGridBWP` or `ResourceGridInCarrier`.

For `hNRReferenceWaveformGenerator`, `[waveform, waveinfo] = generateWaveform(wavegen)`
returns the grid in `waveinfo.ResourceGridBWP` and the rate in `waveinfo.Info.SampleRate`.

Copyright 2026 The MathWorks, Inc.
