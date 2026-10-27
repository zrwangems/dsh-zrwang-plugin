# Bluetooth Toolbox — Functional API Reference

Verified against official MathWorks documentation (2026-05-21).
Use this file to avoid re-fetching web docs for Bluetooth Toolbox functions.

---

## 1. bleWaveformGenerator (R2022a)

**Purpose:** Generate BLE PHY waveform from message bits.

### Syntax

```matlab
waveform = bleWaveformGenerator(message)
waveform = bleWaveformGenerator(message, Name=Value)
```

### Input: `message`

- Binary-valued column vector (PDU + CRC data)
- Maximum length: 2088 bits
- Data types: `double` | `single` | `int8` | `logical`

### Name-Value Arguments

| Parameter | Default | Valid Values | Notes |
|-----------|---------|-------------|-------|
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"`, `"LE500K"`, `"LE125K"` | PHY mode |
| `ChannelIndex` | `37` | 0-39 | Used by whitening block |
| `SamplesPerSymbol` | `8` | Positive integer | GFSK modulation |
| `WhitenStatus` | `"On"` | `"On"`, `"Off"` | Data whitening |
| `DFPacketType` | `"Disabled"` | `"Disabled"`, `"ConnectionlessCTE"`, `"ConnectionCTE"` | CTE enable |
| `AccessAddress` | Advertising default | 32-bit column vector | Override access addr |
| `ModulationIndex` | `0.5` | [0.45, 0.55] | GFSK mod index |
| `PulseLength` | `1` | [1, 4] symbol intervals | Frequency pulse shape |
| `OutputDataType` | (inferred) | `"single"`, `"double"` | Output precision |

### Output: `waveform`

- Complex column vector (Ns-by-1)
- LE1M/LE2M: includes 40 extra bits (access address + preamble)
- Data types: `double` | `single`

### Critical Notes

- **No config object.** `bleWaveformConfig` does NOT exist.
- **CTE is NOT configured via CTELength/CTEType NV args.** CTE parameters are encoded in the PDU bits. Only `DFPacketType` enables CTE processing.
- First arg must be binary column vector, not struct/object.
- Symbol rate: LE2M = 2 MHz, all others = 1 MHz.

---

## 2. bleIdealReceiver (R2022a)

**Purpose:** Decode BLE PHY waveform. Returns bits, access address, and optionally CTE IQ samples.

### Syntax

```matlab
[bits, accessAddr] = bleIdealReceiver(waveform)
[bits, accessAddr] = bleIdealReceiver(waveform, Name=Value)
[bits, accessAddr, IQsamples] = bleIdealReceiver(___)
```

### Input: `waveform`

- Complex column vector (Ns-by-1)
- Minimum Ns by mode:

| Mode | Min Ns | Must be multiple of |
|------|--------|---------------------|
| LE1M | 40×sps | sps |
| LE2M | 48×sps | sps |
| LE500K | 376×sps | 2×sps |
| LE125K | 376×sps | 8×sps |

### Name-Value Arguments

| Parameter | Default | Valid Values | Notes |
|-----------|---------|-------------|-------|
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"`, `"LE500K"`, `"LE125K"` | Must match generator |
| `ChannelIndex` | `37` | 0-39 | Must match generator |
| `SamplesPerSymbol` | `8` | Positive integer | Must match generator |
| `WhitenStatus` | `"On"` | `"On"`, `"Off"` | Must match generator |
| `DFPacketType` | `"Disabled"` | `"Disabled"`, `"ConnectionlessCTE"`, `"ConnectionCTE"` | Enables IQ output |
| `SlotDuration` | `2` | 1, 2 (microseconds) | CTE slot duration |
| `ModulationIndex` | `0.5` | [0.45, 0.55] | GFSK trellis params |
| `PulseLength` | `1` | [1, 4] | Frequency pulse shape |
| `NoiseVariance` | `1` | Positive scalar (linear) | Input noise variance |

### Outputs

| Output | Description | Type |
|--------|-------------|------|
| `bits` | Recovered payload bits (max 260 bytes) | `int8` column vector |
| `accessAddr` | 32-bit access address | `int8` column vector |
| `IQsamples` | CTE IQ samples (only when DFPacketType != "Disabled") | Complex column vector |

### Critical Notes

- **3rd output (IQsamples) only returned when `DFPacketType` is set to CTE mode.**
- All NV args (Mode, ChannelIndex, SamplesPerSymbol, WhitenStatus) **must match** the generator settings.
- Performs ideal (noiseless reference) demodulation — no receiver impairments modeled.

---

## 3. bleCTEIQSample (R2022a)

**Purpose:** Extract IQ samples from CTE portion of a BLE waveform by performing IQ sampling at reference period and each sample slot.

### Syntax

```matlab
iqSamples = bleCTEIQSample(cteSamples)
iqSamples = bleCTEIQSample(cteSamples, Name=Value)
```

### Input: `cteSamples`

- Complex column vector (CTE portion only, not full waveform)
- Size constraints:

| Mode | Ns range | Must be multiple of |
|------|----------|---------------------|
| LE1M | [16×sps, 160×sps] | 8×sps |
| LE2M | [32×sps, 320×sps] | 16×sps |

### Name-Value Arguments

| Parameter | Default | Valid Values | Notes |
|-----------|---------|-------------|-------|
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"` | Only uncoded modes |
| `SamplesPerSymbol` | `8` | Positive integer | — |
| `SlotDuration` | `2` | 1, 2 (microseconds) | Switch/sample slot |
| `SampleOffset` | `4` | Depends on mode (see below) | Sampling point offset |

**SampleOffset range:**

| Mode | Range |
|------|-------|
| LE1M | [sps/8, 7×(sps/8)] |
| LE2M | [sps/4, 7×(sps/4)] |

### Output: `iqSamples`

- Complex column vector
- Corresponds to 8 us reference period and SlotDuration

### Critical Notes

- Input is the **CTE portion only** — not the full BLE waveform.
- Only LE1M and LE2M (no coded modes).
- Alternative to using `bleIdealReceiver` 3rd output.

---

## 4. bleAngleEstimate (R2020b)

**Purpose:** Estimate AoA or AoD from IQ samples.

### Syntax

```matlab
angle = bleAngleEstimate(IQsamples, cfgAngle)
```

**No name-value arguments. Only two positional inputs.**

### Input: `IQsamples`

- Complex column vector
- Corresponds to 8 us reference period and slot duration
- Obtained from `bleIdealReceiver` (3rd output) or `bleCTEIQSample`

### Input: `cfgAngle`

- `bleAngleEstimateConfig` object (see below)

### Output: `angle`

- Scalar (azimuth only, when elevation = 0) OR
- Two-element row vector `[azimuth, elevation]` (when custom array enabled)

### Critical Notes

- **Does NOT take name-value args.** Does NOT take a waveform directly.
- Input must be pre-extracted IQ samples, not raw waveform.
- Since R2020b (not R2021a).

---

## 5. bleAngleEstimateConfig (R2020b)

**Purpose:** Configuration object for `bleAngleEstimate`.

### Syntax

```matlab
cfgAngle = bleAngleEstimateConfig
cfgAngle = bleAngleEstimateConfig(Name=Value)
```

### Properties

| Property | Default | Valid Values | Description |
|----------|---------|-------------|-------------|
| `ArraySize` | — | Integer >=2 (ULA) or [M,N] (URA) | Antenna array size |
| `ElementSpacing` | `0.5` | Positive scalar <=0.5 | Normalized spacing (wavelengths) |
| `SlotDuration` | `2` | 1, 2 | Switch/sample slot (us) |
| `SwitchingPattern` | — | Integer vector | Antenna switching order |
| `EnableCustomArray` | `false` | true/false | Use custom element positions |
| `ElementPosition` | — | 3×N matrix | Normalized positions (custom only) |

---

## 6. bluetoothWhiten (System Object, R2022b)

**Purpose:** Whiten or dewhiten data bits using LFSR (x⁷+x⁴+1).

### Creation

```matlab
whiten = bluetoothWhiten
whiten = bluetoothWhiten(Name=Value)
```

### Properties

| Property | Default | Valid Values | Tunable |
|----------|---------|-------------|---------|
| `InitialConditionsSource` | `"Property"` | `"Property"`, `"Input port"` | No |
| `InitialConditions` | `[1;1;1;1;1;1;1]` | 7-bit binary column vector (>=1 nonzero) | No |

### Calling

```matlab
y = whiten(x)                    % uses InitialConditions property
y = whiten(x, initCondition)     % uses input port (requires InitialConditionsSource="Input port")
```

### Notes

- Same operation whitens and dewhitens (apply twice = original)
- Channel-index-based init: `initCond = [1; int2bit(channelIndex, 6)]`
- bleWaveformGenerator handles whitening internally when `WhitenStatus="On"`

---

## 7. bluetoothRFPHYTestConfig (R2022a)

**Purpose:** Configure BLE RF-PHY transmitter/receiver test parameters per RF-PHY.TS.p15.

### Syntax

```matlab
cfgRFPHYTest = bluetoothRFPHYTestConfig
cfgRFPHYTest = bluetoothRFPHYTestConfig(Name=Value)
```

### Key Properties

| Property | Default | Valid Values |
|----------|---------|-------------|
| `Test` | `"Output Power"` | 13 test types (see below) |
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"`, `"LE125K"`, `"LE500K"` |
| `PayloadLength` | `37` | [31, 255] bytes |
| `PacketType` | `"Disabled"` | `"Disabled"`, `"ConnectionCTE"` |
| `CTELength` | `2` | [2, 20] (×8 us) |
| `CTEType` | `[0;0]` | `[0;0]`=AoA, `[0;1]`=AoD 2us, `[1;0]`=AoD 1us |
| `SamplesPerSymbol` | `8` | Positive integer |
| `ArraySize` | `4` | Integer >=2 |
| `ElementSpacing` | `0.5` | <=0.5 |
| `ModulationIndex` | `0.5` | [0.45, 0.55] |
| `NumPackets` | `1` | Positive integer |

**Test types:** `"Output Power"`, `"Inband emissions"`, `"Modulation characteristics"`, `"Carrier frequency offset and drift"`, `"Tx power stability"`, `"C/I"`, `"Blocking"`, `"Intermodulation"`, `"Receiver sensitivity"`, `"Maximum input signal level"`, `"PER report integrity"`, `"IQ samples coherency"`, `"IQ samples dynamic range"`

### Notes

- This config goes to `bluetoothTestWaveform` (generation) and `bluetoothTestWaveformValidate` (validation).
- CTELength/CTEType properties only available when PacketType="ConnectionCTE" and Mode is LE1M/LE2M.

---

## 8. bluetoothTestWaveformConfig (R2022a)

**Purpose:** Configure `bluetoothTestWaveform` for generating BR/EDR or LE test waveforms.

### Syntax

```matlab
cfgTestWaveform = bluetoothTestWaveformConfig
cfgTestWaveform = bluetoothTestWaveformConfig(Name=Value)
```

### Key Properties

| Property | Default | Valid Values | Notes |
|----------|---------|-------------|-------|
| `Mode` | `"LE1M"` | `"LE1M"`, `"LE2M"`, `"LE125K"`, `"LE500K"`, `"BR"`, `"EDR2M"`, `"EDR3M"` | All BLE + BR/EDR |
| `PayloadType` | `0` | [0, 7] | Test payload pattern |
| `PayloadLength` | `255` | [0, 255] bytes | LE modes only |
| `PacketType` | `"Disabled"` | Mode-dependent (see below) | Test packet type |
| `SamplesPerSymbol` | `8` | Positive integer | — |
| `WhitenStatus` | `"On"` | `"On"`, `"Off"` | — |
| `WhitenInitialization` | `[1;1;1;1;1;1;1]` | 7-bit binary vector | When WhitenStatus="On" |
| `ModulationIndex` | `0.5` | [0.45,0.55] LE, [0.28,0.35] BR/EDR | — |
| `PulseLength` | `1` | [1, 4] | LE modes only (R2023a+) |
| `CTELength` | `2` | [2, 20] | LE1M/LE2M + ConnectionCTE |
| `CTEType` | `[0;0]` | `[0;0]`, `[0;1]`, `[1;0]` | LE1M/LE2M + ConnectionCTE |

**PacketType by Mode:**
- LE1M/LE2M: `"ConnectionCTE"`, `"Disabled"`
- LE125K/LE500K: `"Disabled"` only
- BR: `"DH1"`, `"DH3"`, `"DH5"`, `"DM1"`, `"DM3"`, `"DM5"`
- EDR2M: `"2-DH1"`, `"2-DH3"`, `"2-DH5"`, `"2-EV3"`, `"2-EV5"`
- EDR3M: `"3-DH1"`, `"3-DH3"`, `"3-DH5"`, `"3-EV3"`, `"3-EV5"`

---

## 9. bluetoothTestWaveformValidate (R2024a)

**Purpose:** Validate BLE RF-PHY test waveform against test procedures.

### Syntax (multiple forms based on test type)

```matlab
crcError = bluetoothTestWaveformValidate(waveform, cfgRFPHYTest)
[waveformOut, avgFreqDev, avgCenterFreq, maxFreqDev] = bluetoothTestWaveformValidate(...)
[waveformOut, initFreqOffset, carrierFreqDrift] = bluetoothTestWaveformValidate(...)
[relativePhase, sumRelativePhase, angleRelativePhase, ...] = bluetoothTestWaveformValidate(...)
[meanAmpRefAntennas, meanAmpNonRefAntennas] = bluetoothTestWaveformValidate(...)
```

### Inputs

| Argument | Type | Description |
|----------|------|-------------|
| `waveform` | Complex Ns-by-Np | Test waveform |
| `cfgRFPHYTest` | `bluetoothRFPHYTestConfig` | Test configuration |

### Minimum Ns by Mode

| Mode | Min Ns | Multiple of |
|------|--------|-------------|
| LE1M | 248×sps | sps |
| LE2M | 256×sps | sps |
| LE500K | 1054×sps | 2×sps |
| LE125K | 3088×sps | 8×sps |

### Notes

- Output structure depends on which test is configured in cfgRFPHYTest.
- Validates: blocking, C/I, carrier freq offset/drift, intermod, IQ coherency, IQ dynamic range, modulation characteristics, PER integrity.

---

## 10. bluetoothPathLoss (R2022b)

**Purpose:** Estimate path loss between Bluetooth BR/EDR or LE devices.

### Syntax

```matlab
pathLoss = bluetoothPathLoss(distance, cfgPathLoss)
```

### Inputs

| Argument | Type | Description |
|----------|------|-------------|
| `distance` | Nonneg scalar or row vector (meters) | Device separation |
| `cfgPathLoss` | `bluetoothPathLossConfig` object | Path loss config |

### Output

| Argument | Type | Description |
|----------|------|-------------|
| `pathLoss` | Scalar or row vector (dB) | Estimated loss |

---

## 11. bluetoothPathLossConfig (R2022b)

**Purpose:** Configure path loss model for `bluetoothPathLoss`.

### Syntax

```matlab
cfgPathLoss = bluetoothPathLossConfig
cfgPathLoss = bluetoothPathLossConfig(Name=Value)
```

### Properties

| Property | Default | Valid Values | Notes |
|----------|---------|-------------|-------|
| `Environment` | `"Outdoor"` | `"Home"`, `"Industrial"`, `"Office"`, `"Outdoor"` | Selects model |
| `TransmitterAntennaGain` | `0` | [-10, 10] dBi | — |
| `ReceiverAntennaGain` | `0` | [-10, 10] dBi | — |
| `TransmitterCableLoss` | `0` | Nonneg (dB) | — |
| `ReceiverCableLoss` | `0` | Nonneg (dB) | — |
| `TransmitterAntennaHeight` | `1` | Positive (meters) | Outdoor only |
| `ReceiverAntennaHeight` | `1` | Positive (meters) | Outdoor only |
| `PathLossExponent` | `2.2` | Positive scalar | Industrial only |
| `StandardDeviation` | `2.667` | Nonneg (dB) | Industrial/Outdoor |
| `RandomStream` | `"Global stream"` | `"Global stream"`, `"mt19937ar with seed"` | — |
| `Seed` | `73` | Nonneg scalar | When mt19937ar |

**PathLossModel (read-only, derived from Environment):**
- Outdoor → TwoRayGroundReflection
- Industrial → LogNormalShadowing
- Home/Office → NISTPAP02Task6

---

## 12. bleCSWaveform (R2024b)

**Purpose:** Generate BLE Channel Sounding PHY waveform.

### Syntax

```matlab
csPHYWaveform = bleCSWaveform(cfgChannelSounding)
[csPHYWaveform, accessAddress] = bleCSWaveform(cfgChannelSounding)
```

### Input: `cfgChannelSounding`

A `bleCSConfig` object with properties:
- `Mode`: `"LE1M"`, `"LE2M"`, `"LE2M 2BT"` (2BT since R2026a)
- `SamplesPerSymbol`: positive integer
- `DeviceRole`: `"Initiator"`, `"Reflector"`
- `StepMode`: 0, 1, 2, 3
- `ToneDuration`: 80 (StepMode 0) or 10/20/40 (StepMode 2,3) microseconds
- `SequenceType`: `"Sounding Sequence"`, `"Random Sequence"`
- `SequenceLength`: 32/96 (sounding) or 32/64/96/128 (random) bits

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `csPHYWaveform` | Complex column vector | CS waveform |
| `accessAddress` | `int8` 32-bit vector | CS DRBG access address |

### Notes

- Completely separate from `bleWaveformGenerator` — different API, different config.
- Guard duration fixed at 10 us.
- LE2M uses 2x multiplicative factor for sample counts.

---

## Function Availability Timeline

| Release | Functions Added |
|---------|----------------|
| R2022a | `bleWaveformGenerator`, `bleIdealReceiver` |
| R2020b | `bleAngleEstimate`, `bleAngleEstimateConfig` |
| R2022a | `bleCTEIQSample`, `bluetoothRFPHYTestConfig`, `bluetoothTestWaveformConfig`, `bluetoothTestWaveform` |
| R2022b | `bluetoothWhiten`, `bluetoothPathLoss`, `bluetoothPathLossConfig` |
| R2024a | `bluetoothTestWaveformValidate` |
| R2024b | `bleCSWaveform`, `bleCSConfig` |
| R2026a | `bleCSConfig` adds `"LE2M 2BT"` mode |

---

## CTE Workflow Summary (Verified)

```
1. Build PDU bits with CTE info encoded in header
2. Append CRC: crcGenerate(pdu, cfgCRC)
3. Generate: bleWaveformGenerator(pduCRC, DFPacketType="ConnectionlessCTE", ChannelIndex=N)
4. Extract IQ:
   Option A: [bits, addr, iq] = bleIdealReceiver(waveform, DFPacketType="ConnectionlessCTE", SlotDuration=2)
   Option B: iq = bleCTEIQSample(cteSamples, Mode="LE1M", SlotDuration=2)
5. Estimate: angle = bleAngleEstimate(iq, bleAngleEstimateConfig(...))
```

**NOT valid:**
- ~~bleWaveformGenerator(..., CTELength=16, CTEType="AoA")~~ — these are NOT NV args
- ~~bleAngleEstimate(waveform, Mode=..., CTELength=...)~~ — takes (iqSamples, configObj)

---

## Practical Receiver Helpers (Example-Based, R2022a)

These are NOT built-in functions — they ship as example helpers. Access via:
```matlab
openExample('bluetooth/BLEPHYWithRFImpairmentsAndCorrectionsExample')
```

### helperBLEImpairmentsInit

**Purpose:** Initialize RF impairment parameters struct.

```matlab
initImp = helperBLEImpairmentsInit(phyMode, sps)
```

**Output struct fields:**
- `pfo` — Phase/frequency offset object (set `.FrequencyOffset`, `.PhaseOffset`)
- `vdelay` — Variable delay vector (timing drift)
- `dc` — DC offset percentage

### helperBLEImpairmentsAddition

**Purpose:** Apply all RF impairments to a BLE waveform.

```matlab
txImpairedWfm = helperBLEImpairmentsAddition(txWaveform, initImp)
```

Applies: frequency offset → phase offset → timing drift → DC offset.

### helperBLEPracticalReceiver

**Purpose:** Full practical receiver with impairment corrections.

```matlab
[rxBits, accessAddress] = helperBLEPracticalReceiver(rxWaveform, rxCfg)
```

**rxCfg struct fields:**
| Field | Value |
|-------|-------|
| `Mode` | PHY mode string |
| `SamplesPerSymbol` | sps |
| `DFPacketType` | `"Disabled"` |
| `ChannelIndex` | 0-39 |
| `AccessAddress` | 32-bit binary vector |
| `CoarseFreqCompensator` | `comm.CoarseFrequencyCompensator` object |
| `PreambleDetector` | `comm.PreambleDetector` object |

**RX pipeline:** AGC → DC removal → coarse CFO → matched filter → preamble detection → timing correction → demod → de-whiten.

### helperBLEReferenceResults

**Purpose:** Compute Bluetooth spec reference BER/PER values.

```matlab
[refBER, refPER, refEbNo] = helperBLEReferenceResults(phyMode, payloadLen)
```

### Eb/No to SNR Conversion

```matlab
% Uncoded (LE1M, LE2M):
snr = EbNo - 10*log10(sps);

% Coded (LE500K, rate=1/2):
snr = EbNo + 10*log10(1/2) - 10*log10(sps);

% Coded (LE125K, rate=1/8):
snr = EbNo + 10*log10(1/8) - 10*log10(sps);
```

---

Copyright 2026 The MathWorks, Inc.
Last verified: 2026-05-22 from in.mathworks.com/help/bluetooth/ref/
