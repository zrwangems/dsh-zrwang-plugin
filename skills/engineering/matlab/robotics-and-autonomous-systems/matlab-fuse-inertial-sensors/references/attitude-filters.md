# Attitude Filters Reference (Group A)

Group A filters estimate attitude (orientation, and optionally altitude) from IMU and magnetometer data. They produce no position or velocity output. All assume no sustained linear acceleration beyond gravity.

---

## ecompass

A function, not an object. Single-shot TRIAD method: each call returns orientation independently from one pair of accelerometer + magnetometer readings. No state carried between calls. Useful for initializing other filters or for static/quasi-static applications.

```matlab
% Returns quaternion (default)
orientation = ecompass(accel, mag);

% Return rotation matrix instead
orientation = ecompass(accel, mag, 'rotmat');

% Use ENU reference frame
orientation = ecompass(accel, mag, 'quaternion', 'ReferenceFrame', 'ENU');
```

- No construction, no loop, no tuning.
- Not suitable for dynamic motion (no gyroscope, no filtering).

---

## imufilter

Error-state Kalman filter for 6-axis IMU (accel + gyro). No magnetometer: heading drifts over time. Use when no magnetometer is available and heading accuracy is not critical.

**Construction**

```matlab
filt = imufilter('SampleRate', 100);          % Hz
filt.AccelerometerNoise      = 0.00019247;    % (m/s^2)^2
filt.GyroscopeNoise          = 9.1385e-5;     % (rad/s)^2
filt.GyroscopeDriftNoise     = 3.0462e-13;    % (rad/s)^2
filt.LinearAccelerationNoise = 0.0096236;     % (m/s^2)^2
```

**Fusion loop**

```matlab
for i = 1:N
    [orientation(i), angVel(i,:)] = filt(accel(i,:), gyro(i,:));
end
```

- `orientation` is a `quaternion` array.
- `SampleRate` must match the actual data rate.
- Accel input must be in m/s² — multiply g-unit data by 9.80665.

**Tuning (Signature A: modifies filter in-place)**

```matlab
tune(filt, sensorData, groundTruth);

% With custom config
config = tunerconfig('imufilter', 'MaxIterations', 200);
tune(filt, sensorData, groundTruth, config);
```

- `sensorData` and `groundTruth` are tables with variable names matching filter inputs/outputs (`Accelerometer`, `Gyroscope`, `Orientation`).


---

## ahrsfilter

Error-state Kalman filter for 9-axis MARG (accel + gyro + mag). Magnetometer corrects heading drift. Prefer over `complementaryFilter` when statistical tuning is needed.

**Construction**

```matlab
filt = ahrsfilter('SampleRate', 100);
filt.AccelerometerNoise              = 0.00019247;   % (m/s^2)^2
filt.GyroscopeNoise                  = 9.1385e-5;    % (rad/s)^2
filt.MagnetometerNoise               = 0.1;          % µT^2
filt.LinearAccelerationNoise         = 0.0096236;    % (m/s^2)^2
filt.MagneticDisturbanceNoise        = 0.5;          % µT^2
filt.ExpectedMagneticFieldStrength   = 50;           % µT
```

- Accel input must be in m/s² — multiply g-unit data by 9.80665.
- Mag input must be in µT — multiply gauss by 100, millitesla by 1000.
- `ExpectedMagneticFieldStrength` (typical range 25–65 µT): compute `median(vecnorm(mag, 2, 2))` on already-converted µT data. On unconverted gauss data the result is ~0.5, setting this ~100× too small and disabling the magnetometer correction.

**Fusion loop**

```matlab
for i = 1:N
    [orientation(i), angVel(i,:)] = filt(accel(i,:), gyro(i,:), mag(i,:));
end
```

**Tuning (Signature A: modifies filter in-place)**

```matlab
tune(filt, sensorData, groundTruth);

config = tunerconfig('ahrsfilter', 'MaxIterations', 200);
tune(filt, sensorData, groundTruth, config);
```

**Assumptions:** Stable magnetic environment. In magnetically disturbed environments, use `MagneticDisturbanceNoise` to reduce magnetometer weight, or switch to `imufilter`.


---

## complementaryFilter

Non-KF complementary filter: combines high-pass-filtered gyro integration with low-pass-filtered accel/mag corrections via scalar gains. Lowest computational cost of all Group A filters.

**Construction**

```matlab
filt = complementaryFilter('SampleRate', 100);
filt.AccelerometerGain = 0.01;    % [0, 1]; lower = trust gyro more
filt.MagnetometerGain  = 0.01;    % [0, 1]
filt.HasMagnetometer   = true;    % set false for 6-axis (no mag)
```

**Fusion loop**

```matlab
% 9-axis
for i = 1:N
    [orientation(i), angVel(i,:)] = filt(accel(i,:), gyro(i,:), mag(i,:));
end

% 6-axis (no magnetometer) — must call release() before changing non-tunable property
release(filt);
filt.HasMagnetometer = false;
for i = 1:N
    [orientation(i), angVel(i,:)] = filt(accel(i,:), gyro(i,:));
end
```

**Tuning:** No `tune` method. Adjust `AccelerometerGain` and `MagnetometerGain` manually. Lower gain values reduce accel/mag influence (less noise, more gyro drift); higher values reduce drift but amplify accel noise.

---

## ahrs10filter

Discrete EKF for 10-axis MARG + altimeter. Outputs orientation, altitude, and vertical velocity. Requires a barometric or pressure altimeter.

**Construction**

```matlab
filt = ahrs10filter;
filt.IMUSampleRate = 100;   % Hz (note: IMUSampleRate, not SampleRate)
```

Set `GyroscopeNoise` and `AccelerometerNoise` from your IMU datasheet (units: (rad/s)² and (m/s²)² per axis). Default values are illustrative only — copy them verbatim and accuracy will be poor on real data. Tune with `tune(filt, tunernoise(filt), sensorData, groundTruth)` if ground truth is available.

**Fusion loop**

`ahrs10filter` uses explicit `predict` / `fusemag` / `fusealtimeter` calls, not a single function call.

```matlab
for i = 1:N
    predict(filt, accel(i,:), gyro(i,:));

    if magAvailable(i)
        Rmag = 0.1;              % scalar or [3x3] measurement noise (µT^2)
        fusemag(filt, mag(i,:), Rmag);
    end

    if altAvailable(i)
        Ralt = 1.0;              % altitude measurement noise (m^2)
        fusealtimeter(filt, alt(i), Ralt);
    end
end

[altitude, orientation] = pose(filt);   % position = scalar altitude (m); velocity omitted
stateinfo(filt)   % inspect all 18 state elements
```

**Tuning (Signature B: returns tunedNoise struct)**

```matlab
measureNoise = tunernoise(filt);
config = tunerconfig(filt, 'MaxIterations', 200);
tunedNoise = tune(filt, measureNoise, sensorData, groundTruth, config);
```


---

## Reference Frame

All Group A object filters default to `"NED"`. To use ENU:

```matlab
% Object filters (imufilter, ahrsfilter, complementaryFilter, ahrs10filter)
filt.ReferenceFrame = "ENU";

% ecompass (function, not object)
orientation = ecompass(accel, mag, 'quaternion', 'ReferenceFrame', 'ENU');
```

---

## Tuning API Summary

| Filter                | Tunable | Signature   | Key note                                      |
| --------------------- | ------- | ----------- | --------------------------------------------- |
| `ecompass`            | No      | n/a         | Function; no state                            |
| `imufilter`           | Yes     | A (in-place)| `tune(filt, sensorData, groundTruth)`         |
| `ahrsfilter`          | Yes     | A (in-place)| `tune(filt, sensorData, groundTruth)`         |
| `complementaryFilter` | No      | n/a         | Manual gain adjustment only                   |
| `ahrs10filter`        | Yes     | B (returns) | `tunedNoise = tune(filt, tunernoise(filt), …)` |

**Signature A** (`imufilter`, `ahrsfilter`): modifies the filter in-place; no `tunernoise` call needed.

**Signature B** (`ahrs10filter`): call `tunernoise(filt)` first, pass the struct to `tune`, apply returned `tunedNoise` to the filter.

---

## Gotchas

| Situation                              | Wrong                           | Correct                                              |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| Sample rate property name              | `filt.SampleRate` on ahrs10filter | `filt.IMUSampleRate`                               |
| Running ahrs10filter loop              | `filt(accel, gyro, mag, alt)`   | `predict` + `fusemag` + `fusealtimeter` separately  |
| Async sensors with imufilter/ahrsfilter | Use as-is with irregular timing | These are sync-only; use `insEKF(insMotionOrientation)` instead |

Copyright 2026 The MathWorks, Inc.
