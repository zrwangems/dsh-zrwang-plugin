# RSSI-Based Localization Reference

## Overview

BLE beacons broadcast advertising packets on channels 37, 38, 39. Receivers
estimate distance from Received Signal Strength Indicator (RSSI) using
path loss models.

## Advertising Channel Frequencies

| Channel | Frequency | Position in Band |
|---------|-----------|------------------|
| 37 | 2.402 GHz | Bottom (below WLAN Ch 1) |
| 38 | 2.426 GHz | Middle (between WLAN Ch 1 & 6) |
| 39 | 2.480 GHz | Top (above WLAN Ch 11) |

## Free-Space Path Loss Model

`FSPL(dB) = 20*log10(d) + 20*log10(f) - 147.55`

Where d = distance in meters, f = frequency in Hz.

| Distance | FSPL (2.402 GHz) | RSSI (Tx=0 dBm) |
|----------|-----------------|------------------|
| 1 m | 40.1 dB | -40.1 dBm |
| 2 m | 46.1 dB | -46.1 dBm |
| 5 m | 54.0 dB | -54.0 dBm |
| 10 m | 60.1 dB | -60.1 dBm |
| 20 m | 66.1 dB | -66.1 dBm |

## Practical Considerations

- Free-space model is optimistic; indoor environments add 2-20 dB fading
- Use all 3 advertising channels and average for more robust RSSI
- BLE 5.1+ direction finding (CTE) provides angular estimates beyond RSSI
- Typical BLE receiver sensitivity: -70 to -100 dBm
- Advertising interval affects update rate (typical: 100-1000 ms)

## Trilateration Workflow

1. Deploy 3+ BLE beacons at known positions
2. Measure RSSI from each beacon
3. Convert RSSI to estimated distance using path loss model
4. Solve trilateration equations for position estimate

----

Copyright 2026 The MathWorks, Inc.
