# Prerequisites: Helper Files

Copy helper files from MathWorks examples into your project folder to
avoid fragile `openExample` + `addpath` session dependencies.

## How to copy helpers

```matlab
% 1. Open the example (creates a temporary folder with helpers)
openExample('satcom/GalileoWaveformGenerationExample');
exFolder = pwd;

% 2. Copy all helpers and data files to your project
copyfile(fullfile(exFolder, 'Helper*.m'), projectFolder);
copyfile(fullfile(exFolder, '*.xml'), projectFolder);
```

Repeat for any additional example listed below.

## Galileo

| Source Example | Files to Copy |
|----------------|---------------|
| `satcom/GalileoWaveformGenerationExample` | `HelperAddGalileoSatellitesToScenario.m`, `HelperGNSSChannel.m`, `HelperGPSConvertTime.m`, `HelperGalileoNavigationData.m`, `HelperGalileoCodes.m`, `galileoAlmanac.xml` |
| `shared_nav_satcom/GalileoGNSSReceiverPositioningExample` | `HelperGalileoNavigationData.m` (if not already copied above) |

## GPS

| Source Example | Files to Copy |
|----------------|---------------|
| `satcom/GNSSSignalTransmissionUsingSDRExample` | `HelperGNSSChannel.m`, `HelperGPSAlmanac2Config.m`, `HelperGPSNAVDataEncode.m`, `HelperGPSConvertTime.m`, `gpsAlmanac.txt` |
| `shared_nav_satcom/EndtoEndGPSLNAVReceiverExample` | `HelperGPSRINEX2Config.m`, `HelperGPSNavigationConfig.m` |

## NavIC

| Source Example | Files to Copy |
|----------------|---------------|
| `satcom/NavICWaveformGenerationExample` | `HelperNavICBBWaveform.m`, `HelperNavICDataEncode.m` |
| `shared_nav_satcom/EndtoEndNavICConstellationSimulationExample` | `HelperGNSSChannel.m`, `HelperAddSatellite.m`, `HelperNavICRINEX2Config.m`, `HelperNavICConfig.m`, `HelperGNSSConvertTime.m` |

## RINEX Files Available on the MATLAB Path

These RINEX navigation files ship with MathWorks toolbox examples and are
always available via `which()` after opening the relevant example:

| File | Constellation | Source Example | Epoch |
|------|--------------|----------------|-------|
| `IITK00IND_R_20243400400_01H_MN.rnx` | NavIC | `shared_nav_satcom/EndtoEndNavICConstellationSimulationExample` | 05-Dec-2024 |
| `GODS00USA_R_20211750000_01D_GN.rnx` | GPS | `shared_nav_satcom/EndtoEndGPSLNAVReceiverExample` | 24-Jun-2021 |

**Usage:**
```matlab
% Open example to put files on path (one-time per session)
openExample('shared_nav_satcom/EndtoEndNavICConstellationSimulationExample');
close all;

% Now accessible by name
rinexData = rinexread('IITK00IND_R_20243400400_01H_MN.rnx');
```

**Important:** Set `startTime` to match the RINEX file epoch. Using a time
far from the epoch produces all-NaN latency (zero visible satellites).

## Notes

- Copy all files for your constellation upfront -- avoids path issues later.
- If a helper exists in multiple examples, prefer the waveform-specific one.
- **These helpers can have bugs.** Inspect helper source before assuming
  your code is wrong.

Copyright 2026 The MathWorks, Inc.
