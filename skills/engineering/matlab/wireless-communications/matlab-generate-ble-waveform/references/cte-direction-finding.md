# CTE Direction Finding Reference

## Overview

Constant Tone Extension (CTE) enables Bluetooth direction finding by appending
an unmodulated constant-frequency tone to the end of a BLE packet. Receivers
use antenna switching during the CTE to measure phase differences for Angle
of Arrival (AoA) or Angle of Departure (AoD) estimation.

## CTE Types

| Type | Description | Supported Modes |
|------|-------------|----------------|
| `ConnectionCTE` | Connection-oriented, used in data channels | LE1M, LE2M |
| `ConnectionlessCTE` | Periodic advertising, direction broadcast | LE1M only |

## Mode Compatibility Matrix

| Mode | Disabled | ConnectionCTE | ConnectionlessCTE |
|------|:--------:|:-------------:|:-----------------:|
| LE1M | Yes | Yes | Yes |
| LE2M | Yes | Yes | No |
| LE500K | Yes | No | No |
| LE125K | Yes | No | No |

## Duration Impact

CTE adds unmodulated samples after the packet payload:
- LE1M + ConnectionCTE: adds ~56-240 us (depends on CTE length)
- LE1M + ConnectionlessCTE: adds ~104-240 us
- LE2M + ConnectionCTE: adds ~184-240 us

## Key Constraints

1. **ConnectionlessCTE requires LE1M** -- attempting LE2M throws an error
2. **Coded modes do not support CTE** -- LE500K/LE125K with any CTE type throws an error
3. **CTE is appended, not embedded** -- the packet payload is unchanged
4. **The CTE portion is a pure tone** -- constant phase, no modulation

## BLE 5.1 Specification Reference

- CTE length: 2-20 units (each unit = 8 us, so 16-160 us of tone)
- Switching slots: 1 us or 2 us
- Reference period: 8 us (4 us reference + 4 us for first switch slot)

----

Copyright 2026 The MathWorks, Inc.
