# BLE Direction Finding (CTE)

Bluetooth 5.1+ Constant Tone Extension for Angle of Arrival (AoA) and
Angle of Departure (AoD) direction finding.

## Overview

CTE appends an unmodulated tone after the CRC. During CTE, the antenna
array switches between elements. IQ samples captured during switching
slots allow angle estimation.

## CTE Structure

```
Guard (4 us) | Reference (8 us) | [Switch (slot) | Sample (slot)] x N
```

## API Architecture

CTE parameters are **not** name-value arguments to `bleWaveformGenerator`.
Instead:
- CTE configuration is encoded **inside the PDU bits**
- `DFPacketType` name-value arg enables CTE processing
- `bleIdealReceiver` extracts IQ samples as its 3rd output
- `bleCTEIQSample` is an alternative IQ extractor (R2022a+)
- `bleAngleEstimate(iqSamples, bleAngleEstimateConfig)` estimates angles

## Complete CTE Workflow

### Step 1: Build PDU with CTE info

```matlab
% PDU hex encoding includes CTE length, type in the header
pduHex = '02049B0327';
pdu = int2bit(hex2dec(pduHex), 40, false);
```

### Step 2: Append CRC

```matlab
cfgCRC = crcConfig( ...
    Polynomial="z^24+z^10+z^9+z^6+z^4+z^3+z+1", ...
    InitialConditions=int2bit(hex2dec('555551'), 24), ...
    DirectMethod=true);
pduCRC = crcGenerate(pdu, cfgCRC);
```

### Step 3: Generate waveform with CTE enabled

```matlab
txWaveform = bleWaveformGenerator(pduCRC, ...
    ChannelIndex=36, ...
    DFPacketType="ConnectionlessCTE");
```

Only `DFPacketType` controls CTE at the generator level:
- `"Disabled"` (default) — no CTE
- `"ConnectionlessCTE"` — connectionless direction finding
- `"ConnectionCTE"` — connection-oriented direction finding

### Step 4: Extract IQ samples

**Option A — via bleIdealReceiver (R2022a+):**
```matlab
[bits, accAddr, iqSamples] = bleIdealReceiver(txWaveform, ...
    ChannelIndex=36, ...
    DFPacketType="ConnectionlessCTE", ...
    SlotDuration=2);
```

**Option B — via bleCTEIQSample (R2022a+):**
```matlab
iqSamples = bleCTEIQSample(cteSamples, ...
    Mode="LE1M", SamplesPerSymbol=8, SlotDuration=2);
```

### Step 5: Estimate angle

```matlab
cfgAngle = bleAngleEstimateConfig;
cfgAngle.ArraySize = 4;
cfgAngle.SlotDuration = 2;
cfgAngle.SwitchingPattern = [1 2 3 4];

angle = bleAngleEstimate(iqSamples, cfgAngle);
```

## bleAngleEstimateConfig Properties

| Property | Description | Example |
|----------|-------------|---------|
| `ArraySize` | Number of antenna elements | 4 |
| `ElementSpacing` | Normalized spacing (wavelengths) | 0.5 |
| `SlotDuration` | Switch/sample slot (1 or 2 us) | 2 |
| `SwitchingPattern` | Antenna switching order | [1 2 3 4] |
| `EnableCustomArray` | Use custom element positions | false |
| `ElementPosition` | 3×N position matrix (when custom) | — |

## bleCTEIQSample Parameters (R2022a+)

| Parameter | Default | Valid Values |
|-----------|---------|-------------|
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"` |
| `SamplesPerSymbol` | `8` | Positive integer |
| `SlotDuration` | `2` | 1, 2 (microseconds) |
| `SampleOffset` | `4` | Depends on mode and sps |

## Constraints

- **Data channel only:** CTE requires `ChannelIndex` 0-36
- **LE1M or LE2M only:** CTE is not defined for LE500K/LE125K
- **No CTELength/CTEType as generator args:** These go in the PDU bits
- **bleAngleEstimate takes a config object:** Not name-value args

Copyright 2026 The MathWorks, Inc.
