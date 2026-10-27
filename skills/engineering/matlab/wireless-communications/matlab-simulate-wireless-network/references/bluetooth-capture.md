# Bluetooth Capture and Event Callbacks

Bluetooth-specific capture tools and event callback patterns for system-level simulation.

## Bluetooth PCAP Link Types

When using the generic `pcapWriter` for Bluetooth packets:

| Link Type | Value | Protocol |
|-----------|:-----:|----------|
| `LINKTYPE_BLUETOOTH_LE_LL` | 251 | Bluetooth LE Link Layer |
| `LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR` | 252 | BLE LL with PHY header |
| `LINKTYPE_BLUETOOTH_HCI_H4` | 201 | Bluetooth HCI |

## blePCAPWriter (Auto-Capture from Nodes)

`blePCAPWriter` wraps `pcapWriter` and adds a `Node` property for automatic packet capture from BLE nodes during simulation — no manual `write()` calls needed.

```matlab
sim = wirelessNetworkSimulator.init;
central = bluetoothLENode("central", Position=[0 0 0], Name="C");
peripheral = bluetoothLENode("peripheral", Position=[5 0 0], Name="P");
cfg = bluetoothLEConnectionConfig;
cfg.ConnectionInterval = 0.02;
cfg.ActivePeriod = 0.005;
configureConnection(cfg, central, peripheral);
traffic = networkTrafficOnOff(DataRate=50, PacketSize=27, OnTime=Inf);
addTrafficSource(central, traffic, DestinationNode=peripheral);

% PCAP writer — Node is read-only after construction
pcapWriter = blePCAPWriter(FileName="ble_capture", Node=[central; peripheral]);

addNodes(sim, [central; peripheral]);
run(sim, 0.1);
% File "ble_capture.pcap" written automatically
```

**BLE only** — no built-in BR/EDR PCAP writer exists. Use `wirelessNetworkEventTracer` for BR/EDR packet logging.

### blePCAPWriter Properties

Key: `FileName` (default "bleCapture"), `Node` (BLE nodes, read-only after construction), `FileExtension` ("pcap"/"pcapng"), `PhyHeaderPresent` (false), `PipeName` ("" — set for live Wireshark streaming).

Reading: `readAll(pcapReader("ble_capture.pcap"))` → struct with `.Packet` (raw bytes), `.Timestamp`.

## Bluetooth Event Callbacks

`registerEventCallback` on Bluetooth nodes (both `bluetoothLENode` and `bluetoothNode`) fires technology-specific events with detailed `EventData` payloads.

```matlab
registerEventCallback(peripheral, "ReceptionEnded", @processRxEvent);
```

Callback signature — **single argument** (event data struct):

```matlab
function processRxEvent(eventData)
    pdu = eventData.EventData.PDU;
    sinr = eventData.EventData.SINR;
    rssi = eventData.EventData.RSSI;
    freq = eventData.EventData.ReceiveCenterFrequency;
    phyOk = eventData.EventData.PHYDecodeStatus == 0;
    pduOk = eventData.EventData.PDUDecodeStatus == 0;
end
```

### Valid Event Names (Bluetooth)

| Event Name | Description |
|------------|-------------|
| `"TransmissionStarted"` | Packet transmission begins |
| `"ReceptionEnded"` | Packet reception completes |
| `"AppPacketGenerated"` | App layer generates packet |
| `"AppPacketReceived"` | App layer receives packet |
| `"ChangingState"` | Node state transition (useful for debugging connection establishment) |

### Bluetooth EventData Fields

**ReceptionEnded:** `PDU`, `Length`, `Duration`, `ReceiveCenterFrequency`, `ReceiveBandwidth`, `PHYDecodeStatus` (0=success), `PDUDecodeStatus` (0=success), `SINR`, `RSSI`, `TransmitterNodeID`, `LogicalTransport`, `Role`, `PHYMode`, `AccessAddress` (BLE only).

**TransmissionStarted:** `PDU`, `Length`, `Duration`, `TransmitPower`, `TransmitCenterFrequency`, `TransmitBandwidth`, `LogicalTransport`, `Role`, `PHYMode`, `AccessAddress`.

**ChangingState:** `PreviousState`, `NextState`, `PreviousStateDuration`, `CenterFrequency`, `Bandwidth`.

**AppPacketGenerated:** `Packet`, `PacketLength`, `DestinationNodeID`.
**AppPacketReceived:** `Packet`, `PacketLength`, `SourceNodeID`.

**BR/EDR-specific:** `LogicalTransport` = `"ACL"`/`"SCO"`, `PHYMode` = `"BR"`/`"EDR2M"`/`"EDR3M"`.

Extracting SINR: `arrayfun(@(e) e.EventData.SINR, read(eventTracer, EventName="ReceptionEnded"))`.

## Capture Tool Decision Guide

| Need | Tool | When |
|------|------|------|
| BLE PCAP for Wireshark | `blePCAPWriter` | BLE packet analysis in external tools |
| Generic PCAP (any technology) | `pcapWriter` | Manual capture with custom link types |
| Custom per-packet logic | `registerEventCallback` | Trigger actions based on events during sim |
| Structured event log | `wirelessNetworkEventTracer` | Post-hoc analysis |
| PHY IQ samples | `wirelessIQLogger` | Spectrum analysis |

## Common Mistakes

| Mistake | Correct |
|---------|---------|
| `eventData.SINR` (top level) | `eventData.EventData.SINR` (nested) |
| `eventData.EventData.CRCFailed` | Field doesn't exist — use `PHYDecodeStatus == 0` |
| `eventData.CenterFrequency` for Rx | `eventData.EventData.ReceiveCenterFrequency` |
| `blePCAPWriter()` without `Node=` | `blePCAPWriter(FileName="f", Node=[nodes])` — Node required at construction |
| Using `blePCAPWriter` for BR/EDR | BLE only — use `wirelessNetworkEventTracer` for BR/EDR |


<!-- Copyright 2026 The MathWorks, Inc. -->
