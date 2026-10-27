# WLAN MAC Frame Properties Reference

`wlanMACFrameConfig` properties change dynamically based on `FrameType`. Always
call `disp(cfg)` after creation to see the available properties for the
selected frame type.

## Frame Types and Properties

### Control Frames

**RTS** (`'RTS'`):
Duration, Address1, Address2

**CTS** (`'CTS'`):
Duration, Address1

**ACK** (`'ACK'`):
Duration, Address1

**Block Ack** (`'Block Ack'`):
PowerManagement, MoreData, Duration, Address1, Address2, SequenceNumber,
TID, BlockAckBitmap

**CF-End** (`'CF-End'`):
Duration, Address1, Address2

### Data Frames

**Data** (`'Data'`):
ToDS, FromDS, Retransmission, PowerManagement, MoreData, Duration,
Address1, Address2, Address3, SequenceNumber

**Null** (`'Null'`):
ToDS, FromDS, Retransmission, PowerManagement, MoreData, Duration,
Address1, Address2, Address3, SequenceNumber

**QoS Data** (`'QoS Data'`):
ToDS, FromDS, Retransmission, PowerManagement, MoreData, Duration,
Address1, Address2, Address3, SequenceNumber, TID, AckPolicy

**QoS Null** (`'QoS Null'`):
ToDS, FromDS, Retransmission, PowerManagement, MoreData, Duration,
Address1, Address2, Address3, SequenceNumber, TID, AckPolicy

### Management Frames

**Beacon** (`'Beacon'`):
ToDS, FromDS, Retransmission, PowerManagement, MoreData, Duration,
Address1, Address2, Address3, SequenceNumber, ManagementConfig

**Trigger** (`'Trigger'`):
Duration, Address1, Address2

## Payload Requirements

| Frame Type | Needs Payload? | Payload Format |
|------------|---------------|----------------|
| Data | **YES** | Hex octet string (`'A5B6C7'`) |
| QoS Data | **YES** | Hex octet string (`'A5B6C7'`) |
| Block Ack | No | — |
| RTS | No | — |
| CTS | No | — |
| ACK | No | — |
| Beacon | No | — |
| Null | No | — |
| QoS Null | No | — |
| CF-End | No | — |
| Trigger | No | — |

## Calling wlanMACFrame

**With payload** (Data, QoS Data):
```matlab
% Payload is the FIRST argument
payload = 'A5B6C7D8E9F0';  % Hex octets only
[frame, frameLen] = wlanMACFrame(payload, cfgMAC, 'OutputFormat', 'bits');
```

**Without payload** (all other frame types):
```matlab
[frame, frameLen] = wlanMACFrame(cfgMAC, 'OutputFormat', 'bits');
```

**With PHY config** (required for HE/VHT/EHT FrameFormat):
```matlab
[frame, frameLen] = wlanMACFrame(payload, cfgMAC, cfgPHY, 'OutputFormat', 'bits');
```

When `FrameFormat` is anything other than `'Non-HT'`, you **must** pass the PHY
config object as the third argument. Non-HT frames do not need it.

## Common Mistakes

- **Wrong argument order:** `wlanMACFrame(cfgMAC, payload)` fails. Payload must
  be first.
- **Plain text payload:** `'Hello World'` is invalid. Must be hex octets
  (`'48656C6C6F'`).
- **Guessing property names:** Properties like `BAType`, `BABitmap`, `TIDInfo`
  do not exist. Use `disp(cfg)` to discover the actual names.
- **MAC addresses:** Must be 12 hex characters without separators
  (`'FFFFFFFFFFFF'`, not `'FF:FF:FF:FF:FF:FF'`).

## FrameFormat Property

Controls the MAC frame format (separate from FrameType):

| Value | Standard |
|-------|----------|
| `'Non-HT'` | 802.11a/g |
| `'HT-Mixed'` | 802.11n |
| `'VHT'` | 802.11ac |
| `'HE-SU'` | 802.11ax |
| `'HE-EXT-SU'` | 802.11ax extended |
| `'EHT-SU'` | 802.11be |

## UHR Compatibility

`wlanMACFrame` and `wlanMSDULengths` **do not accept UHR example helper configs**
(`uhrMUConfig`, `uhrTBConfig`, `uhrELRConfig`). They only accept built-in toolbox
types: `wlanHTConfig`, `wlanVHTConfig`, `wlanHESUConfig`, `wlanEHTMUConfig`.

Additionally, `wlanMSDULengths` with EHT format requires a **non-OFDMA** config
(`wlanEHTMUConfig("CBW...")`, not the allocation-index form).

**Workaround:** Create a non-OFDMA `wlanEHTMUConfig` proxy with matching parameters,
use it for MAC frame generation, then feed the resulting PSDU bits into
`uhrWaveformGenerator`. EHT and UHR share the same MAC layer, so the bits are
format-compatible.

```matlab
% Proxy for MAC frame generation
cfgEHTProxy = wlanEHTMUConfig("CBW80");
cfgEHTProxy.User{1}.APEPLength = 4000;
cfgEHTProxy.User{1}.MCS = 11;
cfgEHTProxy.User{1}.ChannelCoding = 'LDPC';

cfgMAC = wlanMACFrameConfig('FrameType', 'QoS Data', 'FrameFormat', 'EHT');
cfgMAC.MSDUAggregation = true;
msduLengths = wlanMSDULengths(cfgEHTProxy.User{1}.APEPLength, cfgMAC, cfgEHTProxy);
msdu = cell(1, numel(msduLengths));
for k = 1:numel(msduLengths)
    msdu{k} = randi([0 255], 1, msduLengths(k), 'uint8');
end
[psdu, apepLen] = wlanMACFrame(msdu, cfgMAC, cfgEHTProxy, 'OutputFormat', 'bits');

% Use psdu with UHR config
cfg.User{1}.APEPLength = apepLen;
waveform = uhrWaveformGenerator({psdu}, cfg);
```

## Aggregation

**A-MSDU** (multiple MSDUs in one MPDU):
- Set `cfg.MSDUAggregation = 1` on `'QoS Data'`
- Pass payload as cell array: `wlanMACFrame({'A5B6', 'C7D8'}, cfg)`
- Surfaces `AMSDUDestinationAddress` and `AMSDUSourceAddress` properties

**A-MPDU** (multiple MPDUs in one PHY frame):
- Requires `FrameFormat = 'HT-Mixed'` (or VHT/HE/EHT)
- Set `cfg.MPDUAggregation = 1`
- Must pass a PHY config: `wlanMACFrame(payloads, cfg, cfgPHY)`

## Output Formats

- Default output: hex octet char array
- `'OutputFormat', 'bits'`: binary column vector (int8)
- `frameLen` is always in **octets** (bytes), regardless of output format

----

Copyright 2026 The MathWorks, Inc.
