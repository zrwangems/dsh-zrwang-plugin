# BLE End-to-End PHY Simulation with RF Impairments and Practical Receiver

Verified against MathWorks example (2026-05-22):
`bluetooth/ug/end-to-end-bluetooth-low-energy-phy-simulation-with-rf-impairments-and-corrections`

---

## Overview

This reference covers the **full link-level simulation** pipeline: TX waveform generation → RF impairments → AWGN channel → practical receiver with corrections → BER/PER measurement. Covers all 4 PHY modes simultaneously.

Unlike the ideal receiver pattern in SKILL.md (which uses `bleIdealReceiver`), this pipeline uses `helperBLEPracticalReceiver` with real-world correction algorithms (AGC, CFO compensation, timing recovery, packet detection).

---

## Pipeline Architecture

```
TX: bits → bleWaveformGenerator → helperBLEImpairmentsAddition → awgn → channel output
RX: channel output → helperBLEPracticalReceiver → rxBits
                     (AGC → DC removal → CFO correction → matched filter →
                      preamble detection → timing correction → demod → de-whiten)
```

---

## Complete Simulation Code

### Configuration

```matlab
EbNo = 2:4:10;                                  % Eb/No in dB
sps = 4;                                        % Samples per symbol, must be > 1
dataLength = 42;                                % Header (2) + Payload (37) + CRC (3) bytes
simMode = ["LE1M", "LE2M", "LE500K", "LE125K"];
maxNumErrors = 100;                             % Stopping criterion
maxNumPackets = 10;                             % Stopping criterion (use 10000 for publication)
bitsPerByte = 8;
numMode = numel(simMode);
snrLength = length(EbNo);
[ber, per] = deal(zeros(numMode, snrLength));
```

### Eb/No to SNR Conversion (Critical)

```matlab
% Uncoded modes (LE1M, LE2M): simple oversampling correction
snrVec = EbNo - 10*log10(sps);

% Coded modes: add code rate gain
% LE500K (rate 1/2):
snrVec = EbNo + 10*log10(1/2) - 10*log10(sps);

% LE125K (rate 1/8):
snrVec = EbNo + 10*log10(1/8) - 10*log10(sps);
```

**General formula:**
```matlab
if any(phyMode == ["LE1M", "LE2M"])
    snrVec = EbNo - 10*log10(sps);
else
    if phyMode == "LE500K"
        codeRate = 1/2;
    else
        codeRate = 1/8;
    end
    snrVec = EbNo + 10*log10(codeRate) - 10*log10(sps);
end
```

### Sample Rate Calculation (Compact Form)

```matlab
sampleRate = sps * (1 + (phyMode == "LE2M")) * 1e6;
```

This evaluates to:
- LE1M/LE500K/LE125K: `sps * 1 * 1e6`
- LE2M: `sps * 2 * 1e6`

### Receiver Configuration

```matlab
rxCfg = struct(Mode=phyMode, SamplesPerSymbol=sps, DFPacketType="Disabled");

rxCfg.CoarseFreqCompensator = comm.CoarseFrequencyCompensator( ...
    Modulation="OQPSK", ...
    SampleRate=sampleRate, ...
    SamplesPerSymbol=2*sps, ...
    FrequencyResolution=30);

rxCfg.PreambleDetector = comm.PreambleDetector(Detections="First");
```

### Main Simulation Loop

```matlab
for countMode = 1:numMode
    phyMode = simMode(countMode);
    sampleRate = sps * (1 + (phyMode == "LE2M")) * 1e6;

    % Compute SNR vector for this mode
    if any(phyMode == ["LE1M", "LE2M"])
        snrVec = EbNo - 10*log10(sps);
    else
        if phyMode == "LE500K", codeRate = 1/2; else, codeRate = 1/8; end
        snrVec = EbNo + 10*log10(codeRate) - 10*log10(sps);
    end

    for countSnr = 1:snrLength
        % Reproducible random stream
        stream = RandStream("combRecursive", Seed=0);
        stream.Substream = countSnr;
        RandStream.setGlobalStream(stream);

        errorRate = comm.ErrorRate(Samples="Custom", ...
            CustomSamples=1:(dataLength*bitsPerByte-1));

        % Initialize impairments struct
        initImp = helperBLEImpairmentsInit(phyMode, sps);

        % Receiver config
        rxCfg = struct(Mode=phyMode, SamplesPerSymbol=sps, DFPacketType="Disabled");
        rxCfg.CoarseFreqCompensator = comm.CoarseFrequencyCompensator( ...
            Modulation="OQPSK", SampleRate=sampleRate, ...
            SamplesPerSymbol=2*sps, FrequencyResolution=30);
        rxCfg.PreambleDetector = comm.PreambleDetector(Detections="First");

        [numErrors, perCount, numPacket] = deal(0, 0, 1);

        while numErrors <= maxNumErrors && numPacket <= maxNumPackets
            % --- TX ---
            txBits = randi([0 1], dataLength*bitsPerByte, 1, "int8");
            channelIndex = randi([0 39], 1, 1);

            if channelIndex <= 36
                accessAddress = [1 0 0 0 1 1 1 0 1 1 0 0 1 0 0 1 ...
                    1 0 1 1 1 1 1 0 1 1 0 1 0 1 1 0]';
            else
                accessAddress = [0 1 1 0 1 0 1 1 0 1 1 1 1 1 0 1 ...
                    1 0 0 1 0 0 0 1 0 1 1 1 0 0 0 1]';
            end

            txWaveform = bleWaveformGenerator(txBits, ...
                Mode=phyMode, SamplesPerSymbol=sps, ...
                ChannelIndex=channelIndex, AccessAddress=accessAddress);

            % --- Impairments ---
            initImp.pfo.FrequencyOffset = randsrc(1, 1, -50e3:10:50e3);
            initImp.pfo.PhaseOffset = randsrc(1, 1, -10:5:10);
            initoff = 0.15*sps;
            stepsize = 20*1e-6;
            initImp.vdelay = (initoff:stepsize:initoff+stepsize*(length(txWaveform)-1))';
            initImp.dc = 20;

            txImpairedWfm = helperBLEImpairmentsAddition(txWaveform, initImp);

            % --- Channel ---
            rxWaveform = awgn(txImpairedWfm, snrVec(countSnr));

            % --- RX ---
            rxCfg.ChannelIndex = channelIndex;
            rxCfg.AccessAddress = accessAddress;
            [rxBits, recAccessAddress] = helperBLEPracticalReceiver(rxWaveform, rxCfg);

            % --- BER/PER ---
            if length(txBits) == length(rxBits)
                errors = errorRate(txBits, rxBits);
                ber(countMode, countSnr) = errors(1);
                currentErrors = errors(2) - numErrors;
                if currentErrors
                    perCount = perCount + 1;
                end
                numErrors = errors(2);
            else
                perCount = perCount + 1;
            end
            numPacket = numPacket + 1;
        end
        per(countMode, countSnr) = perCount / (numPacket - 1);
    end
end
```

### Plotting

```matlab
marker = "ox*s";
color = "bmgr";
figure;
tl = tiledlayout(2, 1);
for countMode = 1:numMode
    nexttile(1)
    semilogy(EbNo, ber(countMode,:).', "-"+marker(countMode)+color(countMode))
    hold on

    nexttile(2)
    semilogy(EbNo, per(countMode,:).', "-"+marker(countMode)+color(countMode))
    hold on
end
nexttile(1); grid on; xlabel("Eb/No (dB)"); ylabel("BER")
legend(simMode); title("BER of BLE under RF Impairments")
nexttile(2); grid on; xlabel("Eb/No (dB)"); ylabel("PER")
legend(simMode); title("PER of BLE under RF Impairments")
```

---

## RF Impairments Reference

| Impairment | Parameter | Typical Range | BLE Spec Limit |
|-----------|-----------|---------------|----------------|
| Frequency offset | `initImp.pfo.FrequencyOffset` | -50 to +50 kHz | +/-150 kHz |
| Phase offset | `initImp.pfo.PhaseOffset` | -10 to +10 degrees | — |
| Timing drift | `stepsize` | 20 ppm | +/-50 ppm |
| Static timing offset | `initoff` | 0.15*sps samples | — |
| DC offset | `initImp.dc` | 20 (% of max amp) | — |

### Impairment Application Pipeline

```
txWaveform → [Frequency/Phase Offset] → [Variable Delay (timing drift)] → [DC Offset] → txImpairedWfm
```

---

## Practical Receiver Architecture

`helperBLEPracticalReceiver` implements:

| Stage | Algorithm | System Object / Technique |
|-------|-----------|---------------------------|
| 1 | AGC | Automatic gain normalization |
| 2 | DC removal | Mean subtraction |
| 3 | Coarse CFO correction | `comm.CoarseFrequencyCompensator` (OQPSK modulation, FreqRes=30 Hz) |
| 4 | Matched filtering | Gaussian pulse-shaped filter |
| 5 | Preamble detection | `comm.PreambleDetector` (first detection) |
| 6 | Timing correction | Symbol timing recovery |
| 7 | Demodulation | GFSK demodulation |
| 8 | De-whitening | LFSR-based (from ChannelIndex) |

**Key difference from `bleIdealReceiver`:**
- `bleIdealReceiver`: no impairments modeled, ideal demodulation, returns `int8` bits
- `helperBLEPracticalReceiver`: handles real-world impairments, includes correction algorithms, returns decoded bits

---

## Helper Functions (from MathWorks Example)

These helpers ship with the Bluetooth Toolbox example. To use them, open the example in MATLAB first:

```matlab
openExample('bluetooth/BLEPHYWithRFImpairmentsAndCorrectionsExample')
```

| Helper | Purpose | Inputs | Outputs |
|--------|---------|--------|---------|
| `helperBLEImpairmentsInit` | Create impairment struct | `(phyMode, sps)` | Struct with `pfo`, `vdelay`, `dc` fields |
| `helperBLEImpairmentsAddition` | Apply impairments to waveform | `(txWaveform, initImp)` | Impaired waveform |
| `helperBLEPracticalReceiver` | Full RX chain with corrections | `(rxWaveform, rxCfg)` | `[rxBits, accessAddress]` |
| `helperBLEReferenceResults` | Spec-defined reference BER/PER | `(phyMode, payloadLen)` | `[BER, PER, EbNo]` |

---

## Eb/No to SNR Conversion — Complete Reference

The relationship between Eb/No and SNR depends on the mode:

```
SNR = Eb/No + 10*log10(codeRate) - 10*log10(sps)
```

| Mode | Code Rate | Formula |
|------|:---------:|---------|
| LE1M | 1 (uncoded) | `SNR = EbNo - 10*log10(sps)` |
| LE2M | 1 (uncoded) | `SNR = EbNo - 10*log10(sps)` |
| LE500K | 1/2 | `SNR = EbNo + 10*log10(0.5) - 10*log10(sps)` |
| LE125K | 1/8 | `SNR = EbNo + 10*log10(0.125) - 10*log10(sps)` |

**Why this matters:** The `awgn` function takes SNR (not Eb/No). If you pass Eb/No directly to `awgn`, the noise level will be wrong by 10*log10(sps) dB + code rate gain.

**Applying noise:** Compute explicit signal power and pass it to `awgn`: `sigPower = mean(abs(waveform).^2); rxWf = awgn(waveform, snr, 10*log10(sigPower));`. Never use the `"measured"` flag — it obscures power assumptions and can produce incorrect noise levels after channel effects.

---

## Access Address Details

### Advertising Channels (37-39)

Fixed access address: `0x8E89BED6` (LSB-first binary):
```matlab
accessAddress = [0 1 1 0 1 0 1 1 0 1 1 1 1 1 0 1 1 0 0 1 0 0 0 1 0 1 1 1 0 0 0 1]';
```

### Data Channels (0-36)

Random per-connection, must meet BLE spec Section 2.1.2 Vol-6 Part-B requirements:
```matlab
accessAddress = [1 0 0 0 1 1 1 0 1 1 0 0 1 0 0 1 1 0 1 1 1 1 1 0 1 1 0 1 0 1 1 0]';
```

Requirements for a valid data channel access address:
- Not equal to advertising access address
- No more than 6 consecutive 0s or 1s
- Not all 4 bytes equal
- At least 2 transitions in MSB 6 bits
- At least 24 bit transitions total

---

## BER/PER Measurement Approach

### Using `comm.ErrorRate`

```matlab
errorRate = comm.ErrorRate(Samples="Custom", ...
    CustomSamples=1:(dataLength*bitsPerByte-1));
```

- `CustomSamples` excludes the last bit (to avoid edge effects)
- Returns 3-element vector: `[BER, numErrors, numBitsCompared]`
- Accumulates across multiple calls (stateful System Object)

### PER Logic

```matlab
if length(txBits) == length(rxBits)
    % Packet decoded successfully (may still have bit errors)
    errors = errorRate(txBits, rxBits);
    if errors(2) - previousErrors > 0
        perCount = perCount + 1;  % Packet has errors
    end
else
    % Packet decode failed entirely (length mismatch = packet error)
    perCount = perCount + 1;
end
per = perCount / totalPackets;
```

### Stopping Criteria

Standard Monte Carlo approach:
- `maxNumErrors = 100` (minimum for quick estimate)
- `maxNumPackets = 10` (minimum for quick estimate)
- **For publication:** `maxNumErrors = 1000`, `maxNumPackets = 10000`

---

## Reference Results from Bluetooth Spec

```matlab
headerLen = 2; crcLen = 3;
payloadLen = dataLength - headerLen - crcLen;  % 37 bytes
[refBER, refPER, refEbNo] = helperBLEReferenceResults(phyMode, payloadLen);
```

| Mode | Ref Eb/No (dB) | BER | PER | Notes |
|------|:--------------:|:---:|:---:|-------|
| LE1M | 34.9 | 0.001 | 0.308 | Includes margin for real-world impairments |
| LE2M | 34.9 | 0.001 | 0.308 | Same target as LE1M |
| LE500K | 31.9 | 0.001 | 0.308 | FEC gain reduces required Eb/No |
| LE125K | 25.9 | 0.001 | 0.308 | Strongest coding → lowest Eb/No requirement |

Simulated results will **outperform** these reference values because the reference includes margin for impairments beyond what's modeled in the simulation (multipath, interference, etc.).

---

## Key Differences: Ideal vs Practical Receiver

| Aspect | Ideal (`bleIdealReceiver`) | Practical (`helperBLEPracticalReceiver`) |
|--------|---------------------------|----------------------------------------|
| Input requirements | Clean or AWGN-only waveform | Waveform with RF impairments |
| Impairment correction | None | AGC, DC removal, CFO, timing |
| Packet detection | Implicit (no sync needed) | Preamble-based detection |
| Output type | `int8` column vector | `int8` column vector |
| Use case | Quick BER, CTE IQ extraction | Realistic link-level simulation |
| Speed | Faster (less processing) | Slower (correction algorithms) |
| Toolbox | Built-in function | Example helper (must open example first) |

---

## When to Use Which

| Scenario | Receiver | Reason |
|----------|----------|--------|
| Quick BER curve (AWGN only) | `bleIdealReceiver` | Simple, fast, built-in |
| RF impairment robustness testing | `helperBLEPracticalReceiver` | Handles CFO, timing drift, DC |
| CTE/direction finding | `bleIdealReceiver` (3rd output) | Only way to get IQ samples |
| Receiver algorithm development | `helperBLEPracticalReceiver` (modified) | Customizable correction chain |
| Link budget analysis | Either | Depends on whether impairments matter |

---

Copyright 2026 The MathWorks, Inc.
Last verified: 2026-05-22
