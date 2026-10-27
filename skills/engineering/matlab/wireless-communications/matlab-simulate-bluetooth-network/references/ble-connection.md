# BLE ACL Connection Simulation

Simulate Bluetooth LE ACL (Asynchronous Connection-Less) data links between central and peripheral nodes using system-level simulation.

## When to Use

- BLE central-peripheral ACL data connections (1 central, N peripherals)
- Configuring connection intervals, active periods, offsets, PHYMode
- Comparing PHY modes or connection parameter settings
- Pre-configured instant connections (no advertising/scanning phase)

**Need realistic connection establishment via advertising/scanning?** Use `references/ble-gap-connection.md` instead.

## Multi-Peripheral Star Network

BLE `configureConnection` does NOT accept a vector of peripherals — call per-peripheral in a loop.

```matlab
sim = wirelessNetworkSimulator.init;

central = bluetoothLENode("central", Position=[0 0 0], Name="Central");
peripherals = bluetoothLENode("peripheral", ...
    Position=[5 0 0; 0 5 0; -5 0 0; 0 -5 0], ...
    Name=["P1", "P2", "P3", "P4"]);

numPeripherals = numel(peripherals);
connectionInterval = 0.02;
activePeriod = floor(connectionInterval / numPeripherals / 0.00125) * 0.00125;

cfg = bluetoothLEConnectionConfig;
cfg.ConnectionInterval = connectionInterval;
cfg.ActivePeriod = activePeriod;

for i = 1:numPeripherals
    cfg.ConnectionOffset = (i - 1) * activePeriod;
    cfg.AccessAddress = sprintf("5DA4427%d", i - 1);
    configureConnection(cfg, central, peripherals(i));
end

traffic = networkTrafficOnOff(DataRate=100, PacketSize=27, OnTime=Inf);
addTrafficSource(central, traffic, DestinationNode=peripherals);

addNodes(sim, [central; peripherals(:)]);
run(sim, 0.5);
```

Key rules for multi-peripheral:
- Each connection needs a **unique `AccessAddress`**
- `ConnectionOffset` values must be staggered so active periods don't overlap
- `ActivePeriod` × NumPeripherals ≤ `ConnectionInterval`
- **`ActivePeriod` must be a multiple of 1.25ms** — non-aligned values (e.g., `0.02/3 = 0.006667`) cause infinite scheduling loops. Use `floor(CI/N / 0.00125) * 0.00125` to round down.
- Config is a value class — safe to reuse and modify per iteration

## Traffic Direction

`addTrafficSource(central, traffic, DestinationNode=peripherals)` — call on the **sending** node. Supports vector of destinations.

## Connection Config Properties

| Property | Default | Constraint | Description |
|----------|---------|-----------|-------------|
| `ConnectionInterval` | 0.02 | Multiple of 1.25ms, range [7.5ms, 4s] | Time between connection events |
| `ActivePeriod` | 0.02 | ≤ ConnectionInterval | Active window within each event |
| `ConnectionOffset` | 0 | ≥ 0 | Start time offset for this connection |
| `AccessAddress` | "5DA44270" | 8 hex chars, unique per connection | Link identifier |
| `PHYMode` | "LE1M" | "LE1M", "LE2M", "LE125K", "LE500K" | PHY data rate |
| `Algorithm` | 1 | 1 or 2 | Channel selection algorithm |
| `UsedChannels` | 0:36 | Subset of 0:36 | Active data channel set |
| `SupervisionTimeout` | 1 | > 0 | Connection supervision timeout (s) |
| `MaxPDU` | 251 | [27, 251] | Max PDU payload (Data Length Extension) |
| `HopIncrement` | 5 | [5, 16] | Hop increment for Algorithm 1 |
| `InstantOffset` | 6 | ≥ 6 | Instant offset in connection events |

## PHYMode Behavior

The simulator models **throughput differences** between PHY modes but does **NOT** model coding gain as range extension (`ReceiverSensitivity` is node-level, not per-PHY). To model coded PHY range, run separate simulations with adjusted `ReceiverSensitivity`:

```matlab
central125K = bluetoothLENode("central", Position=[0 0 0], ReceiverSensitivity=-112);
periph125K = bluetoothLENode("peripheral", Position=[400 0 0], ReceiverSensitivity=-112);
```

**ActivePeriod bounds:** `MinAP ≤ ActivePeriod ≤ ConnectionInterval`. The minimum must accommodate one MaxPDU C→P transmission + T_IFS (150µs) + one P→C response + T_MCES within a connection event. It scales with both PHYMode and MaxPDU — slower PHY or larger PDU requires more air time. If violated, `configureConnection` throws an error with the exact threshold.

## KPI Extraction

**Always use `kpi()` for throughput — NOT `statistics().LL.Throughput`:**

```matlab
tput = kpi(central, peripheral, "throughput", Layer="LL");  % CORRECT
% Do NOT use statistics(node).LL.Throughput — kpi() is the standard reporting API
```

Use `kpi(src, dst, metric, Layer=layer)`. For BLE ACL: throughput at `"LL"`, latency at `"App"`, PLR/PDR at both.

For App-layer throughput (not available via kpi): `stats.App.ReceivedBytes * 8 / (simDuration * 1000)` Kbps.

## Critical Constraints

- `PacketSize` ≤ `MaxPDU` (default 251, min 27) — runtime error if exceeded
- `ActivePeriod` minimum depends on PHYMode and MaxPDU — see PHYMode Behavior section above
- Mid-sim channel update: `updateChannelList(central, channels, DestinationNode=peripheral)` — only inside `scheduleAction` callback. See `references/bluetooth-coexistence.md`.

<!-- Copyright 2026 The MathWorks, Inc. -->
