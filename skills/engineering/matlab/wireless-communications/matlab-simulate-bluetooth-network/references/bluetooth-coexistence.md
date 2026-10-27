# Bluetooth Coexistence and Adaptive Frequency Hopping

BLE and BR/EDR in the same 2.4 GHz band, with data-driven channel adaptation to mitigate interference.

## Critical Rules

### updateChannelList (NOT updateChannelMap)

```matlab
status = updateChannelList(bleCentral, goodChannels, DestinationNode=blePeripheral);
```

- Function is `updateChannelList` — `updateChannelMap` does not exist
- `DestinationNode` is **required** and must be a **node object** (not a string name)
- Can only be called **during simulation** (inside a `scheduleAction` callback)
- Accepts one peripheral per call — for multi-peripheral, call once per peripheral in a loop

### Separate addNodes Per Technology

Mixed-type nodes cannot be concatenated:

```matlab
addNodes(sim, [brCentral; brPeripherals(:)]);
addNodes(sim, [bleCentral; blePeripheral]);
```

## Mixed BLE + BR/EDR with AFH

```matlab
sim = wirelessNetworkSimulator.init;

% BR/EDR piconet
brCentral = bluetoothNode("central", Position=[0 0 0], Name="BRCentral");
brPeripherals = bluetoothNode("peripheral", ...
    Position=[0.3 0 0; 0 0.3 0], Name=["BRP1", "BRP2"]);
brCfg = bluetoothConnectionConfig;
brCfg.SCOPacketType = "HV3";
configureConnection(brCfg, brCentral, brPeripherals);

% BLE link (co-located for interference)
bleCentral = bluetoothLENode("central", Position=[0.1 0.1 0], Name="BLECentral");
blePeripheral = bluetoothLENode("peripheral", Position=[5 0 0], Name="BLEPeriph");
bleCfg = bluetoothLEConnectionConfig;
bleCfg.ConnectionInterval = 0.02;
bleCfg.ActivePeriod = 0.005;
configureConnection(bleCfg, bleCentral, blePeripheral);

% Traffic
brTraffic = networkTrafficOnOff(DataRate=100, PacketSize=27, OnTime=Inf);
addTrafficSource(brCentral, brTraffic, DestinationNode=brPeripherals(1));
bleTraffic = networkTrafficOnOff(DataRate=200, PacketSize=50, OnTime=Inf);
addTrafficSource(bleCentral, bleTraffic, DestinationNode=blePeripheral);

% Separate addNodes per technology
addNodes(sim, [brCentral; brPeripherals(:)]);
addNodes(sim, [bleCentral; blePeripheral]);

% Schedule AFH at t=0.3s
userData = struct('bleCentral', bleCentral, 'blePeripheral', blePeripheral);
scheduleAction(sim, @adaptChannelsFcn, userData, 0.3);

run(sim, 0.6);
```

### AFH Callback (local function)

```matlab
function adaptChannelsFcn(actionID, userData)
    stats = statistics(userData.blePeripheral);
    collisions = stats.PHY.PacketCollisions;
    if collisions > 5
        goodChannels = 10:36;
        updateChannelList(userData.bleCentral, goodChannels, ...
            DestinationNode=userData.blePeripheral);
    end
end
```

### AFH Callback (anonymous — works in `evaluate_matlab_code`)

```matlab
reducedChannels = [0:9, 26:36];
scheduleAction(sim, ...
    @(~, data) updateChannelList(data.bleCentral, data.channels, ...
        DestinationNode=data.blePeripheral), ...
    struct('bleCentral', bleCentral, 'blePeripheral', blePeripheral, ...
           'channels', reducedChannels), ...
    1.0);
```

## Two-Simulation Comparison

For before/after AFH comparison, run two identical simulations with same `rng(seed)`. Compare `statistics()` from each.

## BLE Multi-Piconet Coexistence

Multiple BLE piconets interfere on data channels 0–36. Mitigation: **stagger `ConnectionOffset`** so active windows don't overlap.

```matlab
% Piconet 1
cfg1 = bluetoothLEConnectionConfig(ConnectionInterval=0.04, ...
    ActivePeriod=0.015, ConnectionOffset=0, PHYMode="LE1M");
configureConnection(cfg1, c1, p1);

% Piconet 2 (staggered — offset ≥ ActivePeriod avoids overlap)
cfg2 = bluetoothLEConnectionConfig(ConnectionInterval=0.04, ...
    ActivePeriod=0.015, ConnectionOffset=0.02, ...
    AccessAddress="AABBCCDD", PHYMode="LE1M");
configureConnection(cfg2, c2, p2);
```

## Collision Statistics

Key fields from `statistics(node).PHY` (field names differ by technology):

| BLE node field | BR/EDR node field | Description |
|----------------|-------------------|-------------|
| `PacketCollisions` | `PacketCollisions` | Total collisions |
| `CoChannelCollisions` | `CoChannelCollisions` | Same-channel collisions |
| `CollisionsWithBLE` | `CollisionsWithBREDR` | Collisions with same technology |
| `CollisionsWithNonBLE` | `CollisionsWithNonBREDR` | Collisions with other technology |
| `CollisionsWithBLEAndNonBLE` | `CollisionsWithBREDRAndNonBREDR` | Collisions with both |

## Frequency Overlap

- BR/EDR hops across channels 0–78 (mapped to 2402–2480 MHz, 1 MHz spacing)
- BLE uses data channels 0–36 (mapped to 2402–2480 MHz, 2 MHz spacing, excluding advertising channels)

## Common Mistakes

| Mistake | Correct |
|---------|---------|
| `updateChannelMap(...)` | `updateChannelList(...)` |
| `updateChannelList(node, ch)` without DestinationNode | Add `DestinationNode=nodeObject` (required) |
| `DestinationNode="name"` (string) | Must be node object: `DestinationNode=blePeripheral` |
| `addNodes(sim, [brNodes; bleNodes])` | Separate calls per technology |
| Hardcoding `goodChannels = 10:36` | Read `statistics()` to determine bad channels |
| Calling `updateChannelList` before `run()` | Only works inside `scheduleAction` callback |

<!-- Copyright 2026 The MathWorks, Inc. -->

