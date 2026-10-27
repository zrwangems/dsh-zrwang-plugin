# Output Format Structures

## trackingScenarioRecording

Built from a struct array — one element per unique time step.

```matlab
recordedData(ii).SimulationTime = timeInSeconds;  % scalar double, zero-initialized
recordedData(ii).Poses = posesArray;               % P-by-1 struct array
```

Each pose:

```matlab
pose.PlatformID      = 1;                        % positive integer
pose.ClassID         = 0;                        % nonneg integer (0 = unknown)
pose.Position        = [x y z];                  % 1x3, Scenario or ECEF frame
pose.Velocity        = [vx vy vz];               % 1x3
pose.Acceleration    = [ax ay az];               % 1x3
pose.Orientation     = quaternion(1,0,0,0);       % scalar quaternion
pose.AngularVelocity = [wx wy wz];               % 1x3
```

Construction:

```matlab
% Non-geo (Scenario frame):
tsr = trackingScenarioRecording(recordedData);

% Geo (ECEF frame):
tsr = trackingScenarioRecording(recordedData, ...
    CoordinateSystem="Geodetic", IsEarthCentered=true);
```

Optional: attach platform profiles with dimension info:

```matlab
profiles(k).PlatformID = pid;
profiles(k).ClassID = cid;
profiles(k).Dimensions = struct(Length=L, Width=W, Height=H, OriginOffset=[ox oy oz]);
profiles(k).Signatures = [];
tsr.PlatformProfiles = profiles;
```

## Tuning Data Timetable

One timetable per platform. If multiple platforms, output a cell array. The filter tuner uses Position, Velocity, and Acceleration for kinematic filters. Include orientation if the data has it, but it is not used automatically.

```matlab
Time = timeVector - timeVector(1);  % duration, zero-initialized
tt = timetable(Time, PlatformID, Position, Velocity, Acceleration);
```

| Variable | Size | Type | Notes |
|---|---|---|---|
| Time | Nx1 | duration | Required, zero-initialized |
| PlatformID | Nx1 | double | Required |
| Position | Nx3 | double | Required |
| Velocity | Nx3 | double | Required (zeros if unavailable) |
| Acceleration | Nx3 | double | Include if available |
| Orientation | Nx1 | quaternion | Include if available, not used by filter tuner |
| AngularVelocity | Nx3 | double | Include if available, not used by filter tuner |

```matlab
% Single platform → timetable
% Multiple platforms → cell array of timetables
if isscalar(tuningData), tuningData = tuningData{1}; end
```

## Truth Log

Cell array of struct arrays — one cell per time step.

```matlab
truthLog{ii}(jj).Time                = simTimeSeconds;  % scalar double
truthLog{ii}(jj).PlatformID          = pid;
truthLog{ii}(jj).ClassID             = cid;
truthLog{ii}(jj).Position            = [x y z];
truthLog{ii}(jj).Velocity            = [vx vy vz];
truthLog{ii}(jj).Acceleration        = [ax ay az];
truthLog{ii}(jj).Orientation         = quat;            % scalar quaternion
truthLog{ii}(jj).AngularVelocity     = [wx wy wz];
truthLog{ii}(jj).AngularAcceleration = [ax ay az];
```

Initialize with NaN defaults, then fill:

```matlab
poseTemplate = struct('Time',NaN, 'PlatformID',NaN, 'ClassID',NaN, ...
    'Position',NaN(1,3), 'Velocity',NaN(1,3), 'Acceleration',NaN(1,3), ...
    'Orientation',NaN, 'AngularVelocity',NaN(1,3), 'AngularAcceleration',NaN(1,3));
```

## Converted Table

A MATLAB `table` with descriptive column names including units:

```matlab
tab.("Date Time") = datetimeArray;
tab.("Platform ID") = platformIDs;
tab.("Latitude(degree)") = lat;
tab.("vx(m/s)") = vx;
% etc.
```

Keep the user's original units. Label columns with `Name(unit)` format.

## Missing State Defaults

| State | Default |
|---|---|
| Velocity | `[0 0 0]` |
| Acceleration | `[0 0 0]` |
| Orientation | `quaternion(1,0,0,0)` |
| Angular Velocity | `[0 0 0]` |
| Angular Acceleration | `[0 0 0]` |
| Class ID | `0` |
| Platform ID | `1` (single platform) |
| Dimensions | `[0 0 0]` |


----

Copyright 2026 The MathWorks, Inc.
