# Traffic Models Reference

## networkTrafficOnOff

Constant-rate or exponential on/off traffic pattern generator.

| Property | Default | Description |
|----------|---------|-------------|
| `DataRate` | 5 | Packet generation rate in **Kbps** during On state |
| `PacketSize` | 1500 | Packet size in **bytes** |
| `OnTime` | `[]` (exponential) | Fixed On duration in seconds; `Inf` = always on |
| `OffTime` | `[]` (exponential) | Fixed Off duration in seconds; `0` = never off |
| `OnExponentialMean` | 1 | Mean for exponential On duration (used when `OnTime=[]`) |
| `OffExponentialMean` | 2 | Mean for exponential Off duration (used when `OffTime=[]`) |
| `ApplicationData` | ones(1500,1) | Custom payload bytes [0-255] |

### Inter-Packet Timing

`generate()` returns `[dt, packet]` where `dt` is in **milliseconds**:

```
dt_ms = PacketSize_bytes × 8 / DataRate_Kbps
```

### Usage Pattern

```matlab
traffic = networkTrafficOnOff(DataRate=100, PacketSize=27, OnTime=Inf);
addTrafficSource(sourceNode, traffic, nvPairs);
```

## networkTrafficFTP

Models FTP file transfer with reading time between downloads.

| Property | Default | Description |
|----------|---------|-------------|
| `FileSize` | 2e6 | File size in bytes |
| `ReadingTimeMean` | 180 | Mean reading time in seconds |

## networkTrafficVoIP

Models VoIP traffic with silence detection.

| Property | Default | Description |
|----------|---------|-------------|
| `HasSilenceDetection` | true | Enable/disable silence periods |
| `VoiceEncoder` | "G.711" | Encoder type |

## networkTrafficVideoConference

Models video conference traffic based on IEEE 802.11ax Evaluation Methodology. Frames are fragmented into max 1500-byte packets.

| Property | Default | Description |
|----------|---------|-------------|
| `FrameInterval` | 40 | Time between video frames in **ms** (40 ms = 25 fps, 33 ms = 30 fps) |
| `FrameSizeMethod` | `"WeibullDistribution"` | `"WeibullDistribution"` or `"FixedSize"` |
| `FixedFrameSize` | 5000 | Frame size in bytes (when `FrameSizeMethod="FixedSize"`) |
| `WeibullScale` | 6950 | Scale parameter for Weibull distribution, range (0, 54210] |
| `WeibullShape` | 0.8099 | Shape parameter for Weibull distribution, range (0, 1] |
| `HasJitter` | true | Model network jitter via Gamma distribution |
| `GammaShape` | 0.2463 | Jitter Gamma shape, range (0, 5] |
| `GammaScale` | 60.227 | Jitter Gamma scale, range (0, 100] |
| `ProtocolOverhead` | 28 | Protocol overhead bytes added per packet, range [0, 60] |

`generate()` returns `[dt_ms, packetSize_bytes]`. Continuation fragments of the same frame have `dt=0`.

```matlab
videoTraffic = networkTrafficVideoConference(FrameInterval=40, HasJitter=true);
addTrafficSource(sourceNode, videoTraffic, DestinationNode=destNode);
```

**Note:** Packet sizes exceed 251 bytes — not suitable for BLE nodes directly. Use with WLAN, 5G NR, or custom nodes.

<!-- Copyright 2026 The MathWorks, Inc. -->
