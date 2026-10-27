# Multi-Packet Waveforms

## A-MPDU Aggregation

For realistic VHT/HE/EHT packets, use A-MPDU with `wlanMSDULengths`:

```matlab
cfgMAC = wlanMACFrameConfig('FrameType', 'QoS Data', 'FrameFormat', 'VHT');
cfgMAC.MSDUAggregation = 1;
msduLengths = wlanMSDULengths(cfg.APEPLength, cfgMAC, cfg);
msdu = cell(1, numel(msduLengths));
for k = 1:numel(msduLengths)
    msdu{k} = randi([0 255], 1, msduLengths(k), 'uint8');
end
[psdu, apepLen] = wlanMACFrame(msdu, cfgMAC, cfg, 'OutputFormat', 'bits');
cfg.APEPLength = apepLen;  % Feed APEP length back to PHY config
```

**Key points:**
- Payload is a cell array of uint8 vectors (not hex strings)
- Second output of `wlanMACFrame` is the actual APEP length — feed it back to the
  PHY config before waveform generation
- `wlanMSDULengths` computes how many MSDUs fit a given APEP length
- For EHT/UHR compatibility notes, see
  [mac-frame-properties.md](mac-frame-properties.md)

## Identical Packets

```matlab
waveform = wlanWaveformGenerator(bits, cfg, 'NumPackets', 3, 'IdleTime', 20e-6);
```

## Mixed-Format Sequences (e.g., Data-ACK)

Generate each packet separately and concatenate with inter-frame gaps:

```matlab
fs = wlanSampleRate(cfgData);
sifsSamples = round(16e-6 * fs);  % SIFS: response frames (ACK, CTS, BA)
difsSamples = round(34e-6 * fs);  % DIFS: new channel access after exchange
pifsSamples = round(25e-6 * fs);  % PIFS: priority access

% Zero-pad narrower waveforms to match widest antenna count
numAnt = max(size(wvData,2), size(wvACK,2));
wvACKPad = [wvACK, zeros(size(wvACK,1), numAnt - size(wvACK,2))];

% Data->ACK->Data->ACK exchange
waveform = [wvData1; zeros(sifsSamples, numAnt); wvACKPad; ...
            zeros(difsSamples, numAnt); wvData2; zeros(sifsSamples, numAnt); wvACKPad];
```

## Inter-Frame Spacing

| Spacing | Duration | When to use |
|---------|----------|-------------|
| SIFS | 16 us | Immediate responses: ACK, CTS, Block Ack, next in burst |
| DIFS | 34 us | New channel access after an exchange completes |
| PIFS | 25 us | Priority access (polling, beamforming) |

## Oversampling for Mixed-Format Concatenation

When concatenating waveforms of different bandwidths (e.g., Non-HT 20 MHz + EHT
80 MHz), oversample the narrower waveform to match the wider sample rate:

```matlab
fsEHT = wlanSampleRate(cfgEHT);               % 80 MHz
fsNonHT = wlanSampleRate(cfgNonHT);           % 20 MHz
osf = fsEHT / fsNonHT;                        % 4x
wvNonHT = wlanWaveformGenerator(bitsNonHT, cfgNonHT, 'OversamplingFactor', osf);
```

----

Copyright 2026 The MathWorks, Inc.
