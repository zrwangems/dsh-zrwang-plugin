# Data Whitening Reference

## Overview

BLE data whitening XORs payload bits with a Linear Feedback Shift Register
(LFSR) sequence to randomize the bit pattern and flatten the spectrum.

## How Whitening Works

- LFSR polynomial: x^7 + x^4 + 1
- Seed: derived from ChannelIndex (7 bits)
- Applied to: PDU + CRC (not preamble or access address)
- Each channel uses a different whitening seed

## Effect on Spectrum

| WhitenStatus | Bit Pattern | Spectrum |
|-------------|-------------|----------|
| On (default) | Pseudo-random transitions | Flat, noise-like |
| Off | Correlated (payload-dependent) | Spectral peaks/nulls |

## When to Disable Whitening

- Generating known test patterns (e.g., all-zeros, alternating)
- Analyzing raw modulation characteristics
- Debugging specific bit sequences
- RF-PHY tests using predefined payload sequences

## Channel-Dependent Whitening Seeds

Each channel index produces a different LFSR seed:
- Channel 37: seed = 37 (binary: 0100101)
- Channel 38: seed = 38 (binary: 0100110)
- Channel 39: seed = 39 (binary: 0100111)

Same payload on different channels produces different spectral fine structure
(same overall shape, different nulls/peaks in the spectrum).

----

Copyright 2026 The MathWorks, Inc.
