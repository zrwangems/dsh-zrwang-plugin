# Skill: latlon2enu

**Package:** `lanelet2_to_rrhd.utils`
**Function:** `[e, n] = lanelet2_to_rrhd.utils.latlon2enu(lat, lon, latRef, lonRef)`
**Source:** `+lanelet2_to_rrhd/+utils/latlon2enu.m`

## Description
Converts lat/lon to East-North-Up (ENU) meters using WGS-84 flat-earth approximation.

## Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `lat` | double | Latitude in degrees |
| `lon` | double | Longitude in degrees |
| `latRef` | double | Reference latitude (origin) in degrees |
| `lonRef` | double | Reference longitude (origin) in degrees |

## Outputs
- `e` — East (meters from reference)
- `n` — North (meters from reference)

## Algorithm (WGS-84 flat-earth)
```matlab
a = 6378137.0;           % semi-major axis (m)
f = 1/298.257223563;     % flattening
e2 = 2*f - f^2;          % eccentricity squared

latRad = deg2rad(latRef);
sinLat = sin(latRad);

N = a / sqrt(1 - e2 * sinLat^2);                    % radius of curvature (prime vertical)
M = a * (1 - e2) / (1 - e2 * sinLat^2)^1.5;        % radius of curvature (meridional)

mPerDegLat = M * pi / 180;
mPerDegLon = N * cos(latRad) * pi / 180;

n = (lat - latRef) * mPerDegLat;
e = (lon - lonRef) * mPerDegLon;
```

**Inverse:** `rrhd_to_lanelet2.utils.enu2latlon` (algebraically exact inverse)

## Example
```matlab
[e, n] = lanelet2_to_rrhd.utils.latlon2enu(42.3601, -71.0589, 42.36, -71.06);
```

----

Copyright 2026 The MathWorks, Inc.
