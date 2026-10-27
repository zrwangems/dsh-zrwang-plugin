# Reference: Detect GeoReference

## Description
Auto-detects a geographic reference point from the centroid of all node lat/lon values in the parsed OSM struct.

## Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `ll2` | struct | Output from `readOSM` with `.nodes` containers.Map |

## Output
`geoRef` — `[lat, lon]` centroid of all nodes.

## Algorithm
```matlab
nodeKeys = keys(ll2.nodes);
latSum = 0; lonSum = 0;
for i = 1:numel(nodeKeys)
    nd = ll2.nodes(nodeKeys{i});
    latSum = latSum + nd.lat;
    lonSum = lonSum + nd.lon;
end
geoRef = [latSum/numel(nodeKeys), lonSum/numel(nodeKeys)];

% CRITICAL: Ensure geoRef is double before any math (cosd, sind, etc.)
geoRef = double(geoRef);
```

**WARNING:** Values retrieved from `containers.Map` may not retain their numeric type. Always cast `geoRef = double(geoRef)` before passing to trigonometric functions (`cosd`, `sind`). Without this cast, `cosd(geoRef(1))` will error with "Invalid data type. Argument must be double or single."

## Example
```matlab
% After parsing nodes, compute centroid:
% geoRef = [meanLat, meanLon];  e.g. [42.300750, -83.698304]
```

----

Copyright 2026 The MathWorks, Inc.
