# insCF Reference

`insCF` is a gain-based complementary filter. It is simpler to set up than `insEKF` but trades statistical optimality and real-time streaming for ease of use.

**When to use**: Quick prototyping, simple apps, or educational contexts where KF tuning overhead is not warranted.
**When NOT to use**: Production systems, real-time streaming, or any workflow needing covariance output or batch smoothing — use `insEKF` instead.

---

## Key Limitations

- **Batch only**: uses `estimateStates`; no `predict`/`fuse` for real-time streaming
- **No covariance output**: gain-based, not statistically optimal
- **Not tunable via `tune`**: adjust gains manually with `gainparts`
- **`ReferenceFrame` is read-only after construction**: set it via `insCFOptions` at construction time

---

## Sensor and Motion Model Objects

| Role           | Object                  |
| -------------- | ----------------------- |
| Accelerometer  | `insCFAccelerometer`    |
| Gyroscope      | `insCFGyroscope`        |
| Magnetometer   | `insCFMagnetometer`     |
| GPS            | `insCFGPS`              |
| Orientation only (no position) | `insCFMotionOrientation` |
| Full pose (position + velocity + orientation) | `insCFMotionPose` |

---

## Construction

**Orientation only (accel + gyro)**
```matlab
filt = insCF(insCFAccelerometer, insCFGyroscope, insCFMotionOrientation);
```

**Full pose (accel + gyro + GPS)**
```matlab
gpsSensor = insCFGPS;
gpsSensor.ReferenceLocation = [42.3, -71.1, 100];   % [lat deg, lon deg, alt m] — anchors GPS→NED conversion
filt = insCF(insCFAccelerometer, insCFGyroscope, gpsSensor, insCFMotionPose);
```

**Full pose with magnetometer**
```matlab
filt = insCF(insCFAccelerometer, insCFGyroscope, insCFMagnetometer, insCFGPS, insCFMotionPose);
```

**Non-default options (ENU frame, single precision)**
```matlab
opts = insCFOptions(ReferenceFrame="ENU", Datatype="single");
filt = insCF(insCFAccelerometer, insCFGyroscope, insCFGPS, insCFMotionPose, opts);
```

---

## Fusion (Batch)

`insCF` is batch-only. Provide all sensor data as a timetable with column names matching `filt.SensorNames`.

For missing sensor readings at a given timestamp, use `NaN` rows in the timetable — do not skip the row.

```matlab
% Build timetable: column names must match filt.SensorNames exactly
t = seconds((0:N-1)' * dt);
gpsData = nan(N, 3);                             % NaN where GPS unavailable
gpsData(gpsIdx, :) = actualGPS(gpsIdx, :);       % fill rows where GPS is valid
sensorData = timetable(t, accel, gyro, gpsData, 'VariableNames', filt.SensorNames);

states = estimateStates(filt, sensorData);

% Extract the full time series from the OUTPUT timetable — NOT from stateparts
orientation = states.Orientation;   % Nx1 quaternion array
position    = states.Position;      % Nx3 double, meters (NED from ReferenceLocation)
velocity    = states.Velocity;      % Nx3 double, m/s
```

**`stateparts` after `estimateStates` returns the final state only (1×4 double), not the time series.** Always access the full output through the `states` timetable returned by `estimateStates`.

---

## Gain Tuning

There is no `tune` method. Adjust sensor gains manually using `gainparts`.

```matlab
% Read current gain
accelGain = gainparts(filt, 'Accelerometer');
gpsGain   = gainparts(filt, 'GPS');
magGain   = gainparts(filt, 'Magnetometer');

% Set gain
gainparts(filt, 'Accelerometer', 0.02);
gainparts(filt, 'GPS',           0.5);
gainparts(filt, 'Magnetometer',  0.01);
```

Higher gain = more trust in that sensor. Start with small values and increase until the estimate tracks well without oscillating.

---

## Gotchas

- **`tune` does not exist on `insCF`**: calling `tune(filt, ...)` will error. Use `gainparts` instead.
- **`ReferenceFrame` read-only after construction**: always pass `insCFOptions` at construction if you need ENU.
- **`predict`/`fuse` do not exist**: `insCF` has no real-time API. If you need streaming fusion, use `insEKF`.
- **Sensor name strings in `gainparts`** must match values in `filt.SensorNames` exactly (e.g. `'Accelerometer'`, `'GPS'`).
- **`insCFGPS.ReferenceLocation` defaults to `[0, 0, 0]`**: set it on the sensor object before construction if your GPS data uses real LLA coordinates. `insCF` itself has no `ReferenceLocation` property.
- **`stateparts` after `estimateStates` returns the final state only** (1×4 double). Access the full time series via `states.Orientation`, `states.Position`, `states.Velocity` from the `estimateStates` output timetable.

Copyright 2026 The MathWorks, Inc.
