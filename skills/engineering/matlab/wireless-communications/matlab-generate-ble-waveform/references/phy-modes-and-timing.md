# BLE PHY Modes and Packet Timing

Detailed timing and structure for all BLE PHY modes. Use this reference when
computing expected waveform durations or verifying packet structure.

## Packet Structure by PHY Mode

### LE 1M Packet Structure

```
Preamble (1 byte) | Access Address (4 bytes) | PDU (2-258 bytes) | CRC (3 bytes)
    8 us                  32 us                    16-2064 us           24 us
```

Total overhead (no payload): 8 + 32 + 16 (header) + 24 = 80 us minimum

### LE 2M Packet Structure

```
Preamble (2 bytes) | Access Address (4 bytes) | PDU (2-258 bytes) | CRC (3 bytes)
    8 us                  16 us                    8-1032 us            12 us
```

Total overhead (no payload): 8 + 16 + 8 (header) + 12 = 44 us minimum

### LE Coded Packet Structure

```
Preamble | Access Address | CI | TERM1 | PDU (coded) | CRC (coded) | TERM2
  80 us       256 us       2us   3us    variable       variable       3us
```

CI (Coding Indicator): selects S=2 or S=8 coding for payload
- S=2 coding: each FEC bit encoded with 2 symbols → 2x overhead
- S=8 coding: each FEC bit encoded with 8 symbols → 8x overhead

Preamble + Access Address + CI + TERM1 are always coded at S=8 (regardless
of selected coding for payload).

## Duration Calculation

### LE 1M

```
duration_us = (preamble + access_addr + pdu_bytes + crc) * 8
            = (1 + 4 + (2 + payloadLength) + 3) * 8
            = (10 + payloadLength) * 8
```

### LE 2M

```
duration_us = (preamble + access_addr + pdu_bytes + crc) * 4
            = (2 + 4 + (2 + payloadLength) + 3) * 4
            = (11 + payloadLength) * 4
```

### LE Coded S=8

```
duration_us = 80 + 256 + 16 + 24 + (2 + payloadLength + 3) * 64
            = 376 + (5 + payloadLength) * 64
```

### LE Coded S=2

```
duration_us = 80 + 256 + 16 + 24 + (2 + payloadLength + 3) * 16
            = 376 + (5 + payloadLength) * 16
```

## Waveform Length Calculation

```matlab
waveformLength = duration_samples = packetDuration_us * 1e-6 * sampleRate
               = packetDuration_us * 1e-6 * symbolRate * samplesPerSymbol
```

## Maximum Packet Durations

| PHY Mode | Max Payload (bytes) | Max Duration (us) |
|----------|--------------------|--------------------|
| LE 1M | 255 | 2120 |
| LE 2M | 255 | 1064 |
| LE Coded S=8 | 255 | 17040 |
| LE Coded S=2 | 255 | 4542 |

## CTE Extension Duration

CTE adds time after CRC:
- CTELength is in units of 8 microseconds
- Valid range: 2-20 (i.e., 16-160 us)
- CTE contains: guard period (4 us) + reference period (8 us) + switch-sample slots

```matlab
cteDuration_us = cfg.CTELength * 8;
totalDuration_us = packetDuration_us + cteDuration_us;
```

## Sample Rate Summary

| PHY Mode | Symbol Rate | Sample Rate (8 sps) | Sample Rate (4 sps) |
|----------|------------|--------------------|--------------------|
| LE1M | 1 Msym/s | 8 MHz | 4 MHz |
| LE2M | 2 Msym/s | 16 MHz | 8 MHz |
| LE500K | 1 Msym/s | 8 MHz | 4 MHz |
| LE125K | 1 Msym/s | 8 MHz | 4 MHz |

Copyright 2026 The MathWorks, Inc.
