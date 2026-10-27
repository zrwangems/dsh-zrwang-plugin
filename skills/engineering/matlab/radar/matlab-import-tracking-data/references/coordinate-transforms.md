# Coordinate Transforms

## When Transforms Are Needed

| Input Frame | → Scenario Recording | → Tuning Data / Truth Log |
|---|---|---|
| Scenario (non-geo x/y/z) | No transform | No transform |
| ECEF | No transform | No transform |
| Geodetic LLA + Local NED | Convert to ECEF | Can keep as-is or convert |
| Geodetic LLA + Local ENU | Convert to ECEF | Can keep as-is or convert |
| Fixed NED (origin known) | Convert to ECEF | Can keep as-is or convert |
| Fixed ENU (origin known) | Convert to ECEF | Can keep as-is or convert |

**Key rule**: `trackingScenarioRecording` with `IsEarthCentered=true` requires ECEF. Other outputs can stay in whatever frame the user's downstream tools expect.

## Geodetic (LLA) → ECEF

```matlab
[xE, yE, zE] = geodetic2ecef(wgs84Ellipsoid, lat, lon, alt);
posECEF = [xE yE zE];
```

Requires Mapping Toolbox or Aerospace Toolbox. If neither is available, suggest that the user install one.

## NED Velocity → ECEF Velocity

```matlab
% Vectorized — no loop needed
[vxE, vyE, vzE] = ned2ecefv(velNED(:,1), velNED(:,2), velNED(:,3), lat, lon);
velECEF = [vxE vyE vzE];
```

Same pattern for acceleration: `ned2ecefv(accNED(:,1), accNED(:,2), accNED(:,3), lat, lon)`.

## ENU Velocity → ECEF Velocity

```matlab
[vxE, vyE, vzE] = enu2ecefv(velENU(:,1), velENU(:,2), velENU(:,3), lat, lon);
velECEF = [vxE vyE vzE];
```

## Fixed NED → ECEF (position)

Position is relative to a fixed origin at (lat0, lon0, alt0):

```matlab
% Convert origin to ECEF
[x0, y0, z0] = geodetic2ecef(wgs84Ellipsoid, lat0, lon0, alt0);
% Rotate displacement from NED to ECEF and add origin
[dxE, dyE, dzE] = ned2ecefv(posNED(:,1), posNED(:,2), posNED(:,3), lat0, lon0);
posECEF = [x0+dxE, y0+dyE, z0+dzE];
```

Velocity in fixed NED uses the same rotation (no origin offset needed):
```matlab
[vxE, vyE, vzE] = ned2ecefv(velNED(:,1), velNED(:,2), velNED(:,3), lat0, lon0);
velECEF = [vxE vyE vzE];
```

## ECEF → Fixed NED (for output)

```matlab
[xN, yN, zN] = ecef2ned(xE, yE, zE, lat0, lon0, alt0, wgs84Ellipsoid);
posNED = [xN yN zN];
```

## Euler Angles → Quaternion

```matlab
% NED convention (aerospace ZYX): yaw, pitch, roll in radians
q = quaternion([yaw pitch roll], 'euler', 'ZYX', 'frame');
```

## NED Quaternion → ECEF Quaternion

```matlab
qECEF = quaternion.zeros(N, 1);
for ii = 1:N
    latR = deg2rad(lat(ii)); lonR = deg2rad(lon(ii));
    R = [-sin(latR)*cos(lonR), -sin(latR)*sin(lonR),  cos(latR);
         -sin(lonR),            cos(lonR),             0;
         -cos(latR)*cos(lonR), -cos(latR)*sin(lonR), -sin(latR)];
    qECEF(ii) = quaternion(R, 'rotmat', 'frame') * qNED(ii);
end
```

## ENU Quaternion → ECEF Quaternion

```matlab
qECEF = quaternion.zeros(N, 1);
for ii = 1:N
    latR = deg2rad(lat(ii)); lonR = deg2rad(lon(ii));
    R = [-sin(lonR),            cos(lonR),             0;
         -sin(latR)*cos(lonR), -sin(latR)*sin(lonR),  cos(latR);
          cos(latR)*cos(lonR),  cos(latR)*sin(lonR),  sin(latR)];
    qECEF(ii) = quaternion(R, 'rotmat', 'frame') * qENU(ii);
end
```

## No-Transform Cases

- **Scenario frame data** (driving, indoor, simulation): Position is x/y/z in an arbitrary frame. Use `trackingScenarioRecording(data)` without `IsEarthCentered`.
- **Data already in ECEF**: Use directly.
- **Tuning data / truth log staying in original frame**: No transform needed if the tracker uses the same frame.


----

Copyright 2026 The MathWorks, Inc.
