# BLE GAP Connection Establishment

Simulate realistic BLE connection setup: Central and Peripherals discover each other via advertising/scanning, then enter the connection state for data exchange.

## When to Use

- Realistic connection establishment (advertising → scanning → connection)
- `bluetoothLEGAPConfig` or `GAPConfig` property
- Directed/undirected connectable advertising
- Limiting simultaneous connections with `MaxConnections`
- Measuring connection establishment time

## Two Modes

| Mode | Use when | configureConnection? |
|------|----------|---------------------|
| **GAP-only** | Don't need PHYMode/ActivePeriod control | No — auto-scheduled |
| **GAP + configureConnection** | Need PHYMode, ActivePeriod, offsets | Yes — extra constraints apply |

Default to **GAP-only** unless you need explicit connection parameter control.

## GAP-Only (Automatic Scheduling)

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothLENode("central", Position=[0 0 0], Name="Central");
peripherals = bluetoothLENode("peripheral", ...
    Position=[5 0 0; 0 5 0; -5 0 0], Name=["P1","P2","P3"]);

centralGAP = bluetoothLEGAPConfig(GAPProcedure="connection establishment", ...
    MaxConnections=3, ScanInterval=0.06, ScanWindow=0.04);
central.GAPConfig = centralGAP;

peripheralGAP = bluetoothLEGAPConfig(GAPProcedure="connection establishment", ...
    AdvertisingInterval=0.03);
for i = 1:numel(peripherals)
    peripherals(i).GAPConfig = peripheralGAP;
end

traffic = networkTrafficOnOff(DataRate=100, PacketSize=50, OnTime=Inf);
addTrafficSource(central, traffic, DestinationNode=peripherals);

addNodes(sim, [central; peripherals(:)]);
run(sim, 2);
```

## GAP + configureConnection (Explicit Scheduling)

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothLENode("central", Position=[0 0 0], Name="Central");
peripherals = bluetoothLENode("peripheral", ...
    Position=[5 0 0; 0 5 0; -5 0 0], Name=["P1","P2","P3"]);

centralGAP = bluetoothLEGAPConfig(GAPProcedure="connection establishment", ...
    ScanInterval=0.1, ScanWindow=0.04);
central.GAPConfig = centralGAP;

peripheralGAP = bluetoothLEGAPConfig(GAPProcedure="connection establishment", ...
    AdvertisingInterval=0.03, AdvertisingEventType="connectable directed low duty cycle", ...
    TargetNode=central);
for i = 1:numel(peripherals)
    peripherals(i).GAPConfig = peripheralGAP;
end

numPeripherals = numel(peripherals);
activePeriod = 0.01;
for i = 1:numPeripherals
    cfg = bluetoothLEConnectionConfig;
    cfg.ConnectionInterval = 0.1;  % MUST equal ScanInterval
    cfg.ActivePeriod = activePeriod;
    cfg.ConnectionOffset = (i-1) * (activePeriod + 0.005);
    cfg.AccessAddress = sprintf("5DA4427%d", i-1);
    cfg.PHYMode = "LE2M";
    configureConnection(cfg, central, peripherals(i));
end

traffic = networkTrafficOnOff(DataRate=100, PacketSize=50, OnTime=Inf);
addTrafficSource(central, traffic, DestinationNode=peripherals);

addNodes(sim, [central; peripherals(:)]);
run(sim, 2);
```

## Measuring Connection Establishment Time

Use a `TransmissionStarted` event callback on each peripheral. When the access address changes from the advertising address to the connection's unique address, the connection is established.

```matlab
% connTimingCallback.m
function connTimingCallback(eventData)
persistent connTimes;
if isempty(connTimes)
    connTimes = containers.Map();
end
advAccessAddr = "8E89BED6";  % BLE advertising access address
pktData = eventData.EventData;
if pktData.AccessAddress ~= advAccessAddr
    nodeName = eventData.NodeName;
    if ~isKey(connTimes, nodeName)
        sim = wirelessNetworkSimulator.getInstance();
        connTimes(nodeName) = sim.CurrentTime;
    end
end
assignin("base", "connEstTimes", connTimes);
end
```

Usage:
```matlab
for i = 1:numel(peripherals)
    registerEventCallback(peripherals(i), "TransmissionStarted", @connTimingCallback);
end
run(sim, 2);
pNames = keys(connEstTimes);
for i = 1:numel(pNames)
    fprintf('%s: %.4f s\n', pNames{i}, connEstTimes(pNames{i}));
end
```

Key points:
- Event-driven (no polling) — detects exact connection moment
- Advertising access address is always `"8E89BED6"`
- Once `AccessAddress` changes, the peripheral is transmitting on the connection
- Must be external `.m` file on path (not local function, not anonymous with side effects)
- `wirelessNetworkSimulator.getInstance().CurrentTime` gives simulation time inside callback
- `assignin("base", varName, value)` exports data from callback to base workspace

## bluetoothLEGAPConfig Properties

| Property | Default | Notes |
|----------|---------|-------|
| `GAPProcedure` | `"none"` | Only `"none"` or `"connection establishment"` |
| `MaxConnections` | 7 | [1, 32] — excess peripherals stay in advertising |
| `AdvertisingEventType` | `"connectable and scannable undirected"` | Directed types require `TargetNode` |
| `TargetNode` | `[]` | Required for directed advertising |
| `AdvertisingInterval` | 0.03 | [0.02, 10485.76] seconds |
| `RandomAdvertising` | false | Adds 0–10 ms jitter |
| `ScanInterval` | 0.05 | [0.0025, 40.96] seconds |
| `ScanWindow` | 0.03 | [0.0025, ScanInterval] |

### AdvertisingEventType Values

| Value | TargetNode? | Use Case |
|-------|:-----------:|----------|
| `"connectable and scannable undirected"` | No | General discovery |
| `"connectable directed low duty cycle"` | Yes | Fast reconnection to known central |
| `"connectable directed high duty cycle"` | Yes | Fastest reconnection |

## Critical Constraints

**Both modes:**
- Both central AND peripherals need `GAPProcedure = "connection establishment"`
- GAP is set via property: `node.GAPConfig = config` (NO `configureGAP()` function)

**GAP + configureConnection only:**
- `ConnectionInterval` MUST equal `ScanInterval`
- `ScanInterval >= ScanWindow + sum(all ActivePeriods)`
- Standard `configureConnection` rules apply (unique AccessAddress, staggered offsets)

## Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| `configureGAP(node, config)` | `node.GAPConfig = config` |
| `GAPProcedure = "advertising"` | Only `"none"` or `"connection establishment"` |
| GAP on Central only | Both sides need it |
| `ConnectionInterval ≠ ScanInterval` | Must be equal (GAP+configureConnection mode) |
| Directed advertising without `TargetNode` | Set `TargetNode = centralNode` |

<!-- Copyright 2026 The MathWorks, Inc. -->

