# Custom Node (wnet.Node Subclass)

Any node that is **not** a specific technology (Bluetooth, WLAN, 5G NR) must be implemented as a custom `wnet.Node` subclass. Technology-specific nodes (`bluetoothLENode`, `bluetoothNode`, `wlanNode`, `nrGNB`, `nrUE`) also inherit from `wnet.Node` — they implement the same method contracts internally. Information in this reference about `wnet.Node` properties (`Position`, `ID`, `Name`, `Velocity`, `Mobility`), `addMobility`, `registerEventCallback`, and `statistics` applies to all nodes regardless of technology.

**Never instantiate `wnet.Node` directly** — it is an abstract base class. Always subclass it.

Override these methods:

| Method | Signature | Contract |
|--------|-----------|----------|
| `run` | `nextInvokeTime = run(obj, currentTime)` | Return `nextInvokeTime > currentTime` unless the node intentionally needs to run again at the same time (e.g., to process a received packet or trigger another operation). Returning `nextInvokeTime == currentTime` without a termination condition causes an infinite loop. |
| `pullTransmittedPacket` | `packet = pullTransmittedPacket(obj)` | Return struct array or `[]` |
| `pushReceivedPacket` | `pushReceivedPacket(obj, packet)` | Buffer received packet (no return) |
| `isPacketRelevant` | `[flag, rxInfo] = isPacketRelevant(obj, packet)` | Return `flag` (logical) and `rxInfo` struct |
| `statistics` | `stats = statistics(obj)` | Return struct with node stats |

**Re-invocation rule:** The simulator calls `run()` again at the same `currentTime` after delivering a received packet. If `run()` unconditionally transmits, this creates an infinite Tx→Rx→Tx loop between nodes. **Fix:** Track `NextTxTime` and only transmit when `currentTime >= round(obj.NextTxTime, 9)`. Store with `round(currentTime + interval, 9)` — the simulator uses nanosecond precision, so floating-point comparisons without rounding cause spurious re-transmissions. Return `nextInvokeTime = obj.NextTxTime` so re-invocations at the same time are no-ops.

## Packet Structure (`wirelessPacket`)

`pullTransmittedPacket` must return a structure (or struct array) conforming to the `wirelessPacket` format. Use `wirelessPacket` to create an empty template:

```matlab
pkt = wirelessPacket;   % Returns struct with all required fields initialized to defaults
```

| Field | Type | Description |
|-------|------|-------------|
| `TechnologyType` | `wnet.TechnologyType` constant | Use `wnet.TechnologyType.Custom1` through `Custom9` for custom nodes. Technology nodes use `wnet.TechnologyType.BluetoothLE` (3), `.BluetoothBREDR` (4), `.WLAN` (1), `.NR5G` (2). |
| `DirectToDestination` | numeric | 0 = through channel model; nonzero = destination node ID (bypasses channel) |
| `TransmitterID` | positive integer | Source node ID (`obj.ID`) |
| `TransmitterPosition` | 1x3 double | `obj.Position` |
| `TransmitterVelocity` | 1x3 double | `obj.Velocity` or `[0 0 0]` if stationary |
| `NumTransmitAntennas` | positive integer | Number of Tx antennas |
| `StartTime` | nonneg scalar | Packet start time (seconds) |
| `Duration` | positive scalar | Packet duration (seconds) |
| `Power` | scalar | Transmit power (dBm) |
| `CenterFrequency` | positive scalar | Center frequency (Hz) |
| `Bandwidth` | positive scalar | Bandwidth (Hz) |
| `Abstraction` | logical | `true` = abstracted PHY, `false` = full waveform |
| `SampleRate` | positive scalar | Sample rate (samples/s); required when `Abstraction=false` |
| `Data` | varies | Payload: uint8 array for abstracted PHY, T×R complex matrix for full PHY |
| `Metadata.Channel` | struct | `struct('PathGains',[],'PathDelays',[],'PathFilters',[],'SampleTimes',[])` — populated by channel model |
| `Tags` | struct array | Optional. Each element has fields: `Name` (string), `Value` (data), `ByteRange` (byte range in packet) |

## Required rxInfo Fields

Returned by `isPacketRelevant`:

| Field | Type |
|-------|------|
| `ID` | positive integer (receiver node ID) |
| `Position` | 1x3 double (receiver position) |
| `NumReceiveAntennas` | positive integer |

## Storing Received Packets

The simulator calls `pushReceivedPacket(obj, packet)` to deliver packets that passed the `isPacketRelevant` check. The `packet` argument is a `wirelessPacket` structure (same format as transmitted packets, but with `Metadata.Channel` populated by the channel model).

Use `wnet.internal.interferenceBuffer` to store received packets. Create one in the constructor and push packets with `addPacket`:

```matlab
properties (Access = private)
    InterfBuffer    % wnet.internal.interferenceBuffer
    RxCount = 0
end
methods
    function obj = MyNode(nvargs)
        % ... set Position, Name ...
        obj.InterfBuffer = wnet.internal.interferenceBuffer( ...
            CenterFrequency=2.4e9, Bandwidth=1e6, Abstraction=true);
    end
    function pushReceivedPacket(obj, packet)
        addPacket(obj.InterfBuffer, packet);
        obj.RxCount = obj.RxCount + 1;
    end
end
```

The interference buffer provides methods to query stored packets:

| Method | Description |
|--------|-------------|
| `addPacket(buf, packet)` | Add a `wirelessPacket` struct; returns buffer index |
| `packetList(buf, startTime, endTime)` | Return packets overlapping the time range |
| `receivedPacketPower(buf, startTime)` | Total power (dBm) of packets on the channel |
| `retrievePacket(buf, bufferIdx)` | Retrieve packet by buffer index |
| `removePacket(buf, bufferIdx)` | Remove packet by buffer index |
| `bufferChangeTime(buf, currentTime)` | Time until next buffer state change |

## Access Specifiers

When overriding inherited methods from `wnet.Node`, you **must** use the same access specifier as the parent class. In R2026a, all five required methods (`run`, `pullTransmittedPacket`, `pushReceivedPacket`, `isPacketRelevant`, `statistics`) are declared with `Access = public` in `wnet.Node`. Your subclass must place them in a `methods` block (default public). Using `methods (Access = protected)` or `methods (Access = private)` will cause a MATLAB error:

```
Error: Method 'run' in class 'MyNode' uses different access permissions than its superclass 'wnet.Node'.
```

**Tip:** If unsure about access specifiers, inspect the parent class metadata:
```matlab
m = ?wnet.Node;
for i = 1:numel(m.MethodList)
    fprintf("%s: Access=%s\n", m.MethodList(i).Name, m.MethodList(i).Access);
end
```

## Event Callbacks for Custom Nodes

The base `wnet.Node.registerEventCallback` is a no-op stub — it accepts arguments but does not store or fire callbacks. For custom nodes that need event callbacks (e.g., for PCAP capture, logging, or external instrumentation), you must:

1. **Override `registerEventCallback`** to store the callback and event name
2. **Fire callbacks manually** at the appropriate points in your node logic

### When to fire each event

| Event | Fire from | Timing |
|-------|-----------|--------|
| `TransmissionStarted` | `run()` | After buffering the packet |
| `ReceptionEnded` | `pushReceivedPacket()` | After storing the received packet |

The callback receives a single `eventData` struct with fields: `EventName`, `NodeName`, `NodeID`, `Timestamp`, `TechnologyType`, `EventData` (nested struct with packet payload in `Data`).

## Troubleshooting

If you encounter errors when creating a custom `wnet.Node` subclass, open the built-in example to inspect a working implementation:

```matlab
openExample("wnet/CreateAndSimulateWirelessNetworkOfCustomNodesExample")
```

Review the custom node class file in the example for correct method signatures, access specifiers, and property declarations.

## Example

```matlab
classdef MyNode < wnet.Node
    properties (Access = private)
        TxBuffer = []
        InterfBuffer
        RxCount = 0
        TxInterval = 0.01
        NextTxTime = 0
        EventCallbacks = struct('EventName', {}, 'Callback', {})
    end
    methods
        function obj = MyNode(nvargs)
            arguments
                nvargs.Position (1,3) double = [0 0 0]
                nvargs.Name string = "MyNode"
            end
            obj.Position = nvargs.Position;
            obj.Name = nvargs.Name;
            obj.InterfBuffer = wnet.internal.interferenceBuffer( ...
                CenterFrequency=2.4e9, Bandwidth=1e6, Abstraction=true);
        end
        function registerEventCallback(obj, eventName, callback)
            eventName = string(eventName);
            for k = 1:numel(eventName)
                idx = numel(obj.EventCallbacks) + 1;
                obj.EventCallbacks(idx).EventName = eventName(k);
                obj.EventCallbacks(idx).Callback = callback;
            end
        end
        function nextInvokeTime = run(obj, currentTime)
            if currentTime >= round(obj.NextTxTime, 9)
                pkt = wirelessPacket;
                pkt.TechnologyType = wnet.TechnologyType.Custom1;
                pkt.DirectToDestination = 0;
                pkt.TransmitterID = obj.ID;
                pkt.TransmitterPosition = obj.Position;
                pkt.TransmitterVelocity = obj.Velocity;
                pkt.NumTransmitAntennas = 1;
                pkt.StartTime = currentTime;
                pkt.Duration = 0.001;
                pkt.Power = 0;
                pkt.CenterFrequency = 2.4e9;
                pkt.Bandwidth = 1e6;
                pkt.Abstraction = true;
                pkt.SampleRate = 1e6;
                pkt.Data = randi([0 255], 1, 50, 'uint8');
                obj.TxBuffer = [obj.TxBuffer pkt];
                obj.NextTxTime = round(currentTime + obj.TxInterval, 9);
                obj.fireEvent("TransmissionStarted", currentTime, pkt);
            end
            nextInvokeTime = obj.NextTxTime;
        end
        function packet = pullTransmittedPacket(obj)
            packet = obj.TxBuffer;
            obj.TxBuffer = [];
        end
        function pushReceivedPacket(obj, packet)
            addPacket(obj.InterfBuffer, packet);
            obj.RxCount = obj.RxCount + 1;
            obj.fireEvent("ReceptionEnded", packet.StartTime + packet.Duration, packet);
        end
        function [flag, rxInfo] = isPacketRelevant(obj, packet)
            flag = (packet.TransmitterID ~= obj.ID);
            rxInfo = struct('ID', obj.ID, 'Position', obj.Position, 'NumReceiveAntennas', 1);
        end
        function stats = statistics(obj, varargin)
            stats.RxCount = obj.RxCount;
        end
    end
    methods (Access = private)
        function fireEvent(obj, eventName, timestamp, pkt)
            for i = 1:numel(obj.EventCallbacks)
                if obj.EventCallbacks(i).EventName == eventName
                    eventData = struct( ...
                        'EventName', eventName, ...
                        'NodeName', obj.Name, ...
                        'NodeID', obj.ID, ...
                        'Timestamp', timestamp, ...
                        'TechnologyType', 'Custom1', ...
                        'EventData', struct('Data', pkt.Data));
                    obj.EventCallbacks(i).Callback(eventData);
                end
            end
        end
    end
end
```


<!-- Copyright 2026 The MathWorks, Inc. -->
