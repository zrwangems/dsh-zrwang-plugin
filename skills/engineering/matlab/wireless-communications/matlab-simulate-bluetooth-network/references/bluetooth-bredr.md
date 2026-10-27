# Bluetooth BR/EDR Simulation

Simulate Classic Bluetooth (BR/EDR) networks with ACL data and SCO voice connections.

## When to Use

- BR/EDR piconets (earbuds, headsets, audio accessories)
- SCO voice links (HV1, HV2, HV3) with or without ACL data
- ACL data packet types (DH1–DH5, 3-DH1–3-DH5) and throughput

## Critical Rules

- Uses `bluetoothNode` (not `bluetoothLENode`) and `bluetoothConnectionConfig`
- `configureConnection(cfg, central, peripherals)` — accepts vector of peripherals (unlike BLE)
- `kpi(..., Layer="Baseband")` — only layer available; no latency via kpi (use `statistics()`)
- Max 7 peripherals per central — use multiple centrals for more
- **SCO is implicit**: setting `cfg.SCOPacketType = "HV3"` reserves SCO slots automatically. Only add traffic for ACL data, never for SCO.

### Latency from statistics()

Latency is populated on the **receiving** node (the node that receives the traffic).

```matlab
stats = statistics(peripheral);  % receiver of the traffic
latency = stats.Baseband.ConnectionStats(1).AverageACLPacketLatency;
```

## SCO Earbud Piconet

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothNode("central", Position=[0 0 0], Name="Phone");
peripherals = bluetoothNode("peripheral", ...
    Position=[0.3 0 0; 0 0.3 0], Name=["LeftEar", "RightEar"]);

cfg = bluetoothConnectionConfig;
cfg.SCOPacketType = "HV3";
cfg.CentralToPeripheralACLPacketType = "DH1";
configureConnection(cfg, central, peripherals);

% ACL data traffic (SCO voice is automatic)
traffic = networkTrafficOnOff(DataRate=50, PacketSize=27, OnTime=Inf);
addTrafficSource(central, traffic, DestinationNode=peripherals);

addNodes(sim, [central; peripherals(:)]);
run(sim, 0.5);

% Results
for i = 1:numel(peripherals)
    tput = kpi(central, peripherals(i), "throughput", Layer="Baseband");
    plr = kpi(central, peripherals(i), "PLR", Layer="Baseband");
    fprintf('%s: %.2f kbps, PLR=%.4f\n', peripherals(i).Name, tput, plr);
end
```

**Traffic DataRate is in Kbps** — use `DataRate=50` for 50 Kbps, not `DataRate=50000`.

## SCO Packet Types and Slot Reservation

| Type | Slot Usage | Interval | Voice Payload | Coding |
|------|-----------|----------|---------------|--------|
| HV1 | 1 slot | Every 2 slots | 10 bytes | 1/3 FEC |
| HV2 | 1 slot | Every 4 slots | 20 bytes | 2/3 FEC |
| HV3 | 1 slot | Every 6 slots | 30 bytes | None |

HV3 is the most common — reserves 1/6 of available slots (least overhead).

### Multi-SCO and SCO+ACL Constraints

- Max SCO links: HV1=1, HV2=2, HV3=3. All links in a piconet must use the same type (mixing is rejected).
- **5-slot ACL never works with any SCO.** HV3 supports asymmetric 3-slot (one dir only). HV2 supports 1-slot only.
- At max SCO links, no ACL capacity remains. Keep SCO links below max for ACL+SCO coexistence.

### SCO + ACL Packet Compatibility

When SCO is active, ACL packet type must fit in remaining slots:

| SCO Type | Symmetric ACL (same both dirs) | Asymmetric ACL (one dir 3-slot, other 1-slot) | 5-slot ACL |
|----------|-------------------------------|----------------------------------------------|-----------|
| HV1 | None — DV only (0 ACL throughput) | None | Never |
| HV2 | 1-slot only: DH1, 2-DH1, 3-DH1 | Not supported | Never |
| HV3 | 1-slot only: DH1, 2-DH1, 3-DH1 | Supported: e.g., C2P=3-DH3, P2C=3-DH1 | Never |
| None | Any | Any | Any |

**Key rules:**
- **5-slot types (DH5, 2-DH5, 3-DH5) never work with any SCO** — always rejected
- **HV3 + 3-slot ACL** works only if one direction uses 1-slot (asymmetric config)
- **HV2 + multi-slot ACL** never works — even asymmetric is rejected
- **HV1** leaves no ACL capacity; toolbox substitutes DV packet (max 9 bytes, 0 ACL packets in practice)

```matlab
% HV3 + asymmetric ACL — VALID
cfg.SCOPacketType = "HV3";
cfg.CentralToPeripheralACLPacketType = "3-DH3";  % 3-slot downlink
cfg.PeripheralToCentralACLPacketType = "3-DH1";  % 1-slot uplink

% HV3 + symmetric 3-slot — INVALID (runtime error)
cfg.CentralToPeripheralACLPacketType = "3-DH3";
cfg.PeripheralToCentralACLPacketType = "3-DH3";  % Error!
```

## ACL Packet Types

| Type | Rate | Slots | Max Payload | Description |
|------|------|-------|-------------|-------------|
| DM1 | 1 Mbps | 1 | 17 bytes | Basic rate, 1-slot, 2/3 FEC |
| DM3 | 1 Mbps | 3 | 121 bytes | Basic rate, 3-slot, 2/3 FEC |
| DM5 | 1 Mbps | 5 | 224 bytes | Basic rate, 5-slot, 2/3 FEC |
| DH1 | 1 Mbps | 1 | 27 bytes | Basic rate, 1-slot |
| DH3 | 1 Mbps | 3 | 183 bytes | Basic rate, 3-slot |
| DH5 | 1 Mbps | 5 | 339 bytes | Basic rate, 5-slot |
| 2-DH1 | 2 Mbps | 1 | 54 bytes | EDR, 1-slot |
| 2-DH3 | 2 Mbps | 3 | 367 bytes | EDR, 3-slot |
| 2-DH5 | 2 Mbps | 5 | 679 bytes | EDR, 5-slot |
| 3-DH1 | 3 Mbps | 1 | 83 bytes | EDR, 1-slot |
| 3-DH3 | 3 Mbps | 3 | 552 bytes | EDR, 3-slot |
| 3-DH5 | 3 Mbps | 5 | 1021 bytes | EDR, 5-slot |

## Connection Config Properties

| Property | Default | Description |
|----------|---------|-------------|
| `CentralToPeripheralACLPacketType` | "DH1" | ACL packet type C→P |
| `PeripheralToCentralACLPacketType` | "DH1" | ACL packet type P→C |
| `SCOPacketType` | "None" | SCO type (or "None" for ACL-only) |
| `HoppingSequenceType` | "Connection basic" | Hopping mode |
| `UsedChannels` | 0:78 | Active channels (79 total for BR/EDR) |
| `PollInterval` | 40 | Max slots between poll requests |
| `TransmitterPower` | 20 | Tx power in dBm |
| `SupervisionTimeout` | 32000 | Timeout in slots |

**PHY mode consistency:** Both ACL directions must use the same PHY family — either both 1 Mbps (DM/DH), both 2 Mbps (2-DH), or both 3 Mbps (3-DH). Mixing (e.g., DH5 + 3-DH1) causes a runtime error.

## Statistics Structure (BR/EDR)

`statistics(node).Baseband.ConnectionStats` (per peer): `PeerNodeName`, `TransmittedDataBytes`, `ReceivedDataBytes`, `TransmittedACLPackets`, `RetransmittedACLPackets`, `ReceivedACLPackets`, `TransmittedSCOPackets`, `ReceivedSCOPackets`, `AverageACLPacketLatency`

## Event Callbacks (BR/EDR)

Single-argument signature: `function myCallback(eventData)`. Fields: `eventData.EventData.LogicalTransport` (`"ACL"`/`"SCO"`), `eventData.EventData.PHYMode` (`"BR"`/`"EDR2M"`/`"EDR3M"`).

```matlab
registerEventCallback(node, "ReceptionEnded", @myCallback);
```

<!-- Copyright 2026 The MathWorks, Inc. -->
