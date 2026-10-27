# RF-PHY Compliance Testing Reference

## Overview

Bluetooth LE RF-PHY testing verifies transmitter and receiver performance
per the RF-PHY.TS.p15 test specification. MATLAB provides two approaches:

1. **`bluetoothTestWaveformConfig` + `bluetoothTestWaveform`** -- Generate
   standardized test packets with predefined payload sequences
2. **`bluetoothRFPHYTestConfig`** -- Configure specific test parameters
   including test IDs, power levels, and measurement settings

## Transmitter Tests

| Test | TestID | Purpose |
|------|--------|--------|
| Output power | RF-PHY/TRM/BV-01-C | Verify max peak/average power |
| Inband emissions | RF-PHY/TRM/BV-03-C | Spectral emissions check |
| Modulation characteristics | RF-PHY/TRM/BV-09-C | Signal modulation quality |
| Carrier frequency offset | RF-PHY/TRM/BV-06-C | Frequency stability |
| Tx power stability | (CTE-related) | AoD signal power stability |

## When to Use Which Function

| Scenario | Function |
|----------|----------|
| Generate arbitrary BLE waveforms | `bleWaveformGenerator` |
| Generate RF-PHY standardized test packets | `bluetoothTestWaveform` |
| Configure RF-PHY test parameters | `bluetoothRFPHYTestConfig` |
| Validate test setup | `bluetoothTestWaveformValidate` |

## Key Differences: bleWaveformGenerator vs bluetoothTestWaveform

| Feature | bleWaveformGenerator | bluetoothTestWaveform |
|---------|---------------------|---------------------|
| Input | Raw message bits | Config object |
| Payload | User-defined | Standardized (PRBS9, PRBS15, etc.) |
| Use case | General waveform gen | Compliance testing |
| CTE support | DFPacketType param | PacketType in config |

----

Copyright 2026 The MathWorks, Inc.
