# Transmitter Measurements Reference

## Overview

Key transmitter measurements for BLE waveforms include output power,
occupied bandwidth, PAPR, and modulation characteristics.

## Measurement Methods

### Occupied Bandwidth (99% Power)

1. Compute power spectrum: `spec = abs(fftshift(fft(wf))).^2`
2. Compute cumulative power: `cumPower = cumsum(spec)/sum(spec)`
3. Find 0.5% and 99.5% boundaries
4. Bandwidth = f(99.5%) - f(0.5%)

Typical results:
- LE1M: ~1.0-1.3 MHz occupied BW
- LE2M: ~2.0-2.5 MHz occupied BW

### Peak-to-Average Power Ratio (PAPR)

`PAPR_dB = 10*log10(max(|wf|^2) / mean(|wf|^2))`

BLE uses constant-envelope GFSK, so PAPR is theoretically 0 dB.
Slight variations come from Gaussian pulse shaping at symbol transitions.

### Output Power

`avgPower_dBm = 10*log10(mean(|wf|^2)) + 30` (assuming 1-ohm reference)

BLE Tx power classes:
- Class 1: +20 dBm max
- Class 1.5: +10 dBm max
- Class 2: +4 dBm max
- Class 3: 0 dBm max

## Modulation Index Effect on Bandwidth

| ModulationIndex | Frequency Deviation | Occupied BW |
|-----------------|--------------------|--------------|
| 0.45 | +/- 225 kHz | ~1.0 MHz |
| 0.50 (default) | +/- 250 kHz | ~1.2 MHz |
| 0.55 | +/- 275 kHz | ~1.3 MHz |

----

Copyright 2026 The MathWorks, Inc.
