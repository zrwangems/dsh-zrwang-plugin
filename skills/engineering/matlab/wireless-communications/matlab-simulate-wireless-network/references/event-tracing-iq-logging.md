# Event Tracing, IQ Logging, and Traffic Visualization

Must be created **before** `run()`.

| Tool | Custom `wnet.Node` | Technology nodes (BLE, BR/EDR, WLAN, NR) |
|------|--------------------|-----------------------------------------|
| `wirelessNetworkEventTracer` | Supported — uses `registerEventCallback` on the node (must be overridden in custom node) | Supported |
| `wirelessIQLogger` | **Not supported** — technology nodes only | Supported |
| `wirelessTrafficViewer` | **Not supported** — technology nodes only | Supported |

For custom node implementation details, see `references/custom-node.md`.

## wirelessNetworkEventTracer

```matlab
eventTracer = wirelessNetworkEventTracer(FileName="sim_events.mat");
addNodes(eventTracer, nodes, EventName=["TransmissionStarted", "ReceptionEnded"]);
```

**How it works:** `addNodes` calls `registerEventCallback` on each node for each specified `EventName`. For technology nodes, this works automatically. For custom `wnet.Node` subclasses, your node's `registerEventCallback` override must support the event names you pass to `addNodes` — the tracer registers its internal logging callback via `registerEventCallback`, and your node must store and fire it at the appropriate points (see `references/custom-node.md` for the full pattern).

**Valid events for technology nodes:** `"TransmissionStarted"`, `"ReceptionEnded"`, `"AppPacketGenerated"`.

**Valid events for custom nodes:** Any event name string that your custom node's `registerEventCallback` override stores and that your node fires via the stored callback (e.g., from `run()` for transmission events, from `pushReceivedPacket()` for reception events). The event names are not restricted to the technology-node list — they can be any string your node supports.

Reading with filters:
```matlab
events = read(eventTracer);
txEvents = read(eventTracer, EventName="TransmissionStarted");
nodeEvents = read(eventTracer, NodeName="AP1");
timeWindow = read(eventTracer, TimeRange=[0.1, 0.3]);
```

Each event struct: `EventName`, `NodeName`, `NodeID`, `Timestamp`, `TechnologyType`, `EventData` (technology-specific nested payload).

**Note:** Errors if MAT file already exists — use unique names for repeated runs.

## wirelessIQLogger

```matlab
iqLogger = wirelessIQLogger(receiverNodes, FileName="iq_data.mat");
iqLogger = wirelessIQLogger(nodes(1:2), FileName=["iq_node1.mat", "iq_node2.mat"]);
```

Nodes fixed at construction. Output MAT contains: `Waveform` (complex single N×1), `Fs` (Hz), `Metadata`.

## wirelessTrafficViewer

Real-time state transitions and channel occupancy. Properties: `ViewType` (`"all"`, `"state-transition-plot"`, `"channel-occupancy-plot"`), `RefreshRate` (0–1000 Hz, default 100).

```matlab
viewer = wirelessTrafficViewer;
addNodes(viewer, nodes);
```

## Decision Guide

| Need | Tool |
|------|------|
| Post-hoc event analysis | `wirelessNetworkEventTracer` |
| Real-time protocol debugging | `wirelessTrafficViewer` |
| PHY-level signal analysis | `wirelessIQLogger` |
| Custom per-packet logic | `registerEventCallback` |

Prefer `wirelessNetworkEventTracer` over manual callbacks for logging.

<!-- Copyright 2026 The MathWorks, Inc. -->
