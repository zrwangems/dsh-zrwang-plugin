# WLAN Coexistence Reference

## Overview

BLE operates in the 2.4 GHz ISM band alongside WLAN (Wi-Fi). Coexistence
testing evaluates BLE receiver performance under WLAN interference.

## BLE Channel Frequencies

| Channel Type | Indices | Frequencies |
|-------------|---------|------------|
| Advertising | 37 | 2.402 GHz |
| Advertising | 38 | 2.426 GHz |
| Advertising | 39 | 2.480 GHz |
| Data | 0-36 | 2.404-2.478 GHz (2 MHz spacing) |

## WLAN Channel Overlap

- WLAN Ch 1: 2.412 GHz (20 MHz BW) -- overlaps BLE data channels 4-14
- WLAN Ch 6: 2.437 GHz (20 MHz BW) -- overlaps BLE data channels 8-25
- WLAN Ch 11: 2.462 GHz (20 MHz BW) -- overlaps BLE data channels 21-34
- BLE advertising channels are placed to minimize WLAN overlap

## Coexistence Test Approach

1. Generate BLE waveform using `bleWaveformGenerator`
2. Create WLAN-like interferer (bandpass noise at offset frequency)
3. Combine signals at desired Carrier-to-Interference (C/I) ratio
4. Decode combined signal with `bleIdealReceiver`
5. Measure BER degradation vs. C/I ratio

## Typical C/I Requirements (BLE Spec)

| Scenario | Required C/I |
|----------|--------------|
| Co-channel (0 MHz offset) | >= 21 dB |
| Adjacent (1 MHz offset) | >= -17 dB |
| Adjacent (2 MHz offset) | >= -27 dB |
| Non-adjacent (>= 3 MHz) | >= -27 dB |

----

Copyright 2026 The MathWorks, Inc.
