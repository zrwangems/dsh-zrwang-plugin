# BLE CIS (Connected Isochronous Stream) Simulation

Simulate LE Audio using Connected Isochronous Streams. CIS provides time-bounded, reliable isochronous data delivery for use cases like stereo speakers, hearing aids, and multi-channel audio.

## When to Use

- Simulating LE Audio with multiple speakers (stereo, surround)
- Configuring CIS timing for LC3 codec alignment
- Testing latency requirements for audio (<20ms)
- Multi-peripheral CIG (Connected Isochronous Group) scheduling

## CIS End-to-End Flow (3 Steps)

```matlab
% Step 1: Create CIS config
cfgCIS = bluetoothLECISConfig(ISOInterval=0.02, MaxPDU=120, NumSubevents=2, BurstNumber=[1 0]);

% Step 2: configureConnection returns UPDATED CIS config (capture 2nd output)
[~, cfgCISOut] = configureConnection(cfgConn, central, peripheral, CISConfig=cfgCIS);

% Step 3: Pass returned cfgCISOut to addTrafficSource
addTrafficSource(central, traffic, DestinationNode=peripheral, CISConfig=cfgCISOut);
```

If struggling with CIS setup, refer to `openExample("bluetooth/BLEMultistreamAudioExample")` for a working reference.

## Quick-Start: Pick a Template

Select the template matching your use case. All values are pre-validated.

| Use Case | NumPerip | PHY | MaxPDU | NSE | ISO (s) | CI (s) | AP (s) |
|----------|:--------:|-----|:------:|:---:|:-------:|:------:|:------:|
| Stereo TWS (2 earbuds) | 2 | LE2M | 120 | 2 | 0.02 | 0.04 | 0.005 |
| Hearing Aid (mono) | 1 | LE2M | 100 | 2 | 0.02 | 0.02 | 0.005 |
| Hearing Aid (bidir) | 1 | LE2M | [100 40] | 2 | 0.02 | 0.02 | 0.005 |
| 4-Speaker Surround | 4 | LE2M | 120 | 2 | 0.02 | 0.08 | 0.005 |
| Stereo LE1M (fallback) | 2 | LE1M | 120 | 1 | 0.02 | 0.04 | 0.005 |
| Low-Latency Stereo | 2 | LE2M | 120 | 1 | 0.01 | 0.02 | 0.005 |

**Formulas** (only needed for non-standard configurations):
- `ConnectionInterval = NumPeripherals × ISOInterval`
- `ConnectionOffset(i) = (i-1) × ISOInterval`
- `ISOInterval >= ActivePeriod + NumPeripherals × NSE × SubeventLength`
- ISOInterval must be a multiple of 1.25ms, range [5ms, 4s]

## Complete Pattern: Stereo TWS

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothLENode("central", Position=[0 0 0]);
peripherals = [bluetoothLENode("peripheral", Position=[-1 1 0]), ...
               bluetoothLENode("peripheral", Position=[1 1 0])];

cfgCIS = bluetoothLECISConfig(ISOInterval=0.02, MaxPDU=120, ...
    NumSubevents=2, BurstNumber=[1 0], FlushTimeout=[2 1]);

for i = 1:2
    cfgConn = bluetoothLEConnectionConfig( ...
        ConnectionInterval=0.04, ...
        ActivePeriod=0.005, ...
        ConnectionOffset=(i-1)*0.02, ...
        AccessAddress=sprintf("5DA4427%d", i-1), ...
        PHYMode="LE2M", MaxPDU=120);

    [~, cfgCISOut] = configureConnection(cfgConn, central, peripherals(i), CISConfig=cfgCIS);

    traffic = networkTrafficOnOff(DataRate=48, PacketSize=120, OnTime=Inf);
    addTrafficSource(central, traffic, DestinationNode=peripherals(i), CISConfig=cfgCISOut);
end

addNodes(sim, [central; peripherals(:)]);
run(sim, 0.5);
```

## Complete Pattern: Hearing Aid Bidirectional

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothLENode("central", Position=[0 0 0]);
peripheral = bluetoothLENode("peripheral", Position=[0.1 0 0]);

cfgCIS = bluetoothLECISConfig(ISOInterval=0.02, MaxPDU=[100 40], ...
    NumSubevents=2, BurstNumber=[1 1], FlushTimeout=[2 2]);

cfgConn = bluetoothLEConnectionConfig( ...
    ConnectionInterval=0.02, ActivePeriod=0.005, ...
    AccessAddress="5DA44270", PHYMode="LE2M", MaxPDU=[100 40]);

[~, cfgCISOut] = configureConnection(cfgConn, central, peripheral, CISConfig=cfgCIS);

trafficDL = networkTrafficOnOff(DataRate=40, PacketSize=100, OnTime=Inf);
addTrafficSource(central, trafficDL, DestinationNode=peripheral, CISConfig=cfgCISOut);

trafficUL = networkTrafficOnOff(DataRate=16, PacketSize=40, OnTime=Inf);
addTrafficSource(peripheral, trafficUL, DestinationNode=central, CISConfig=cfgCISOut);

addNodes(sim, [central, peripheral]);
run(sim, 0.5);
```

## Key Rules

### Rule 1: Use RETURNED CIS Config for Traffic

`configureConnection` returns an updated CIS config with computed read-only fields. You MUST use this returned config:

```matlab
[~, cfgCISOut] = configureConnection(cfgConn, central, peripheral, CISConfig=cfgCIS);
addTrafficSource(central, traffic, DestinationNode=peripheral, CISConfig=cfgCISOut);
```

### Rule 2: ISOInterval = ConnectionInterval / NumPeripherals (STRICT)

This is enforced at runtime. Use the template table or formula:
- `ConnectionInterval = NumPeripherals × ISOInterval`
- Standard choice: `ISOInterval = 0.02` (20ms, matches LC3 frame interval)

### Rule 3: ActivePeriod = 0.005 (safe default)

Use `ActivePeriod = 0.005` for all CIS simulations. This satisfies the minimum for LE1M and LE2M with any MaxPDU ≤ 251.

### Rule 4: ConnectionOffset Staggering

Each peripheral's offset = `(i-1) × ISOInterval`:

```matlab
cfgConn.ConnectionOffset = (i-1) * cfgCIS.ISOInterval;
```

### Rule 5: Parameter Name is `CISConfig`

Always use `CISConfig=...` (not `CfgCIS`, `CISCfg`, or `ISOConfig`).

## Statistics / KPI

**kpi()**: Throughput at `"LL"`, latency at `"App"`, PLR/PDR at both layers.

**statistics(node)**: App layer has `ReceivedPackets/Bytes`, `AveragePacketLatency`. LL layer CIS sub-struct: `CISStatistics.CISID`, `TransmittedPackets`, `ReceivedPackets`, `RetransmittedPackets`, `AcknowledgedPackets`.

## CIS Config Properties

| Property | Range | Default | Notes |
|----------|-------|---------|-------|
| ISOInterval | [5ms, 4s] | 0.02 | Multiple of 1.25ms |
| NumSubevents | [1, 31] | 1 | Retransmission opportunities |
| SubInterval | [0.4ms, 4s] | auto | Time between subevents |
| BurstNumber | [0, 15] | 1 | Scalar or [C→P, P→C] |
| MaxPDU | [0, 251] | 251 | Scalar or [C→P, P→C] |
| FlushTimeout | [1, 255] | 1 | Scalar or [C→P, P→C] |
| CISArrangement | seq/interl | "sequential" | Subevent layout |

Read-only after `configureConnection`: `AccessAddress`, `CISID`, `CISOffset`.

<!-- Copyright 2026 The MathWorks, Inc. -->

