# Navigation Filters Reference (Group B)

Group B filters estimate the full navigation state: orientation + position + velocity (PVA). All require GPS alongside IMU. `ReferenceLocation` must be set before the fusion loop on every Group B filter.

---

## insfilterMARG

Discrete EKF for synchronous MARG + GPS. All sensors must run at the same rate with no dropped samples. The alias `insfilter(...)` returns an `insfilterMARG` object.

**Construction**

```matlab
filt = insfilterMARG;
filt.IMUSampleRate     = 100;                    % Hz
filt.ReferenceLocation = [42.3, -71.1, 0];      % [lat deg, lon deg, alt m]
filt.GyroscopeNoise    = 1e-9;                   % (rad/s)^2
filt.AccelerometerNoise = 1e-4;                  % (m/s^2)^2
```

**Fusion loop**

```matlab
for i = 1:N
    predict(filt, accel(i,:), gyro(i,:));

    if gpsAvailable(i)
        Rgps = diag([8.5, 8.5, 12]);             % position noise (m^2), [3x3]
        fusegps(filt, lla(i,:), Rgps);
    end

    if magAvailable(i)
        Rmag = 0.01;                             % scalar or [3x3] noise (µT^2)
        fusemag(filt, mag(i,:), Rmag);
    end
end

[position, orientation, velocity] = pose(filt);
```

**Gotcha:** `fuse(filt, lla, Rgps)` errors ("Too many input arguments") — always use `fusegps()`, not `fuse()`, for GPS measurements on `insfilterMARG`.

**Tuning (Signature B)**

```matlab
measureNoise = tunernoise(filt);
tunedNoise = tune(filt, measureNoise, sensorData, groundTruth);
```

`tunernoise` returns: `MagnetometerNoise`, `GPSPositionNoise`, `GPSVelocityNoise`.

**Applying tunedNoise in the re-run loop**

The `tunedNoise` struct fields are measurement-noise scalars passed as explicit arguments to `fusemag()` and `fusegps()` — they are **not** direct filter properties and cannot be assigned via `filt.(field) = ...`. Re-initialize the filter state before re-running:

```matlab
% Re-initialize to the same initial conditions as the original run
filt.State(1:4) = q0(:);  % or use copy(filtTemplate) pattern

% Re-run fusion loop with tuned noise
for i = 1:N
    predict(filt, accel(i,:), gyro(i,:));
    fusemag(filt, mag(i,:), tunedNoise.MagnetometerNoise);
    if gpsAvailable(i)
        fusegps(filt, lla(i,:), tunedNoise.GPSPositionNoise, ...
                     vel(i,:), tunedNoise.GPSVelocityNoise);
    end
end
```

**sensorData table column names** (must match exactly — use `table()`, not `timetable()`):

| Column | Type |
|--------|------|
| `Accelerometer` | Nx3 double |
| `Gyroscope` | Nx3 double |
| `Magnetometer` | Nx3 double |
| `GPSPosition` | Nx3 double (LLA; `NaN` rows where GPS unavailable) |
| `GPSVelocity` | Nx3 double (`NaN` rows where GPS unavailable) |

**groundTruth table column names:**

| Column | Type |
|--------|------|
| `Orientation` | Nx1 `quaternion` (not compact doubles) |
| `Position` | Nx3 double (m, local NED from `ReferenceLocation`) |

```matlab
openExample('shared_positioning/EstimatePoseOfUAVMARGEExample')
openExample('shared_positioning/TuneInsfilterMARGToOptimizePoseEstimateExample')
```

---

## insfilterAsync

Continuous-discrete EKF for MARG + GPS with mixed sample rates or dropped samples. `predict` takes a time delta, not accel/gyro data — each sensor is fused independently when available.

**Construction**

```matlab
filt = insfilterAsync;
filt.ReferenceLocation    = [42.3, -71.1, 0];
filt.AccelerationNoise    = [50, 50, 50];         % (m/s^2)^2
filt.AngularVelocityNoise = [0.005, 0.005, 0.005]; % (rad/s)^2
```

**Fusion loop**

```matlab
% predict takes a time delta — NOT accel/gyro (key difference from insfilterMARG)
predict(filt, dt);

% Each sensor fused independently when available
fuseaccel(filt, accel, Raccel);
fusegyro(filt,  gyro,  Rgyro);

if magAvailable
    fusemag(filt, mag, Rmag);
end
if gpsAvailable
    fusegps(filt, lla, Rgps);
end

[position, orientation, velocity] = pose(filt);
```

**Gotcha:** `insfilterAsync.predict(filt, dt)` takes a time delta only — not accel/gyro readings. Accel and gyro are fused as separate measurement updates via `fuseaccel` and `fusegyro`.

**Tuning (Signature B)**

```matlab
measureNoise = tunernoise(filt);
tunedNoise = tune(filt, measureNoise, sensorData, groundTruth);
```

```matlab
openExample('shared_positioning/EstimatePoseOfUAVExample')
openExample('shared_positioning/TuneInsfilterAsyncToOptimizePoseEstimateExample')
```

---

## insfilterNonholonomic

Discrete EKF with nonholonomic (zero side-slip) constraints for ground vehicles. No magnetometer required. Do not use for aerial platforms.

**Construction**

```matlab
filt = insfilterNonholonomic;
filt.IMUSampleRate              = 100;
filt.ReferenceLocation          = [42.3, -71.1, 0];
filt.DecimationFactor           = 2;     % apply nonholonomic constraint every N IMU steps
filt.ZeroVelocityConstraintNoise = 1e-2; % (m/s)^2; tighter = stronger side-slip rejection
```

**Fusion loop**

```matlab
for i = 1:N
    predict(filt, accel(i,:), gyro(i,:));

    if gpsAvailable(i)
        Rgps = diag([8.5, 8.5, 12]);
        fusegps(filt, lla(i,:), Rgps);
    end
end

[position, orientation, velocity] = pose(filt);
```

**Tuning (Signature B)**

```matlab
measureNoise = tunernoise(filt);
tunedNoise = tune(filt, measureNoise, sensorData, groundTruth);
```

---

## insfilterErrorState

Error-state KF for ground vehicles with IMU + GPS, and optionally monocular visual odometry (VO) scale. No magnetometer required. Do not use for aerial platforms.

**Construction**

```matlab
filt = insfilterErrorState;
filt.IMUSampleRate     = 100;
filt.ReferenceLocation = [42.3, -71.1, 0];
filt.GyroscopeNoise    = 1e-9;
filt.AccelerometerNoise = 1e-4;
```

**Fusion loop**

```matlab
for i = 1:N
    predict(filt, accel(i,:), gyro(i,:));

    if gpsAvailable(i)
        Rgps = diag([8.5, 8.5, 12]);
        fusegps(filt, lla(i,:), Rgps);
    end

    if mvoAvailable(i)
        Rpos    = 0.1;                   % position noise (m^2), scalar or [3x3]
        Rorient = 1e-4;                  % orientation noise (rad^2), scalar or [3x3]
        fusemvo(filt, voPosition(i,:), Rpos, voOrientation(i), Rorient);
    end
end

[position, orientation, velocity] = pose(filt);
```

**Tuning (Signature B)**

```matlab
measureNoise = tunernoise(filt);
tunedNoise = tune(filt, measureNoise, sensorData, groundTruth);
```

---

## Reference Frame

All Group B filters default to `"NED"`. To use ENU:

```matlab
filt.ReferenceFrame = "ENU";
```

Set `ReferenceFrame` before the fusion loop. `ReferenceLocation` is always required and is independent of reference frame.

---

## Tuning API Summary

All Group B filters use Signature B: `tune` returns a noise struct; the filter is not modified in-place.

```matlab
measureNoise = tunernoise(filt);
tunedNoise   = tune(filt, measureNoise, sensorData, groundTruth);
% Optionally with config:
config       = tunerconfig('insfilterMARG', 'MaxIterations', 200);
tunedNoise   = tune(filt, measureNoise, sensorData, groundTruth, config);
```

`tunerconfig` accepts a string name for all Group B filters (unlike `insEKF`, which requires an instance).

---

## Gotchas

| Situation                                        | Wrong                              | Correct                                                        |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------- |
| GPS fusion on `insfilterMARG`                    | `fuse(filt, lla, Rgps)`            | `fusegps(filt, lla, Rgps)`                                     |
| Predict step on `insfilterAsync`                 | `predict(filt, accel, gyro)`       | `predict(filt, dt)` — then `fuseaccel` / `fusegyro` separately |
| Using `insfilterNonholonomic` on aerial platform | Applying to UAV / drone            | Ground vehicles only; aerial platforms use `insfilterMARG`     |
| `ReferenceLocation` not set                      | Omit and run fusion loop           | Must set before first `predict` call                           |
| Sample rate property name                        | `filt.SampleRate`                  | `filt.IMUSampleRate` (`insfilterMARG`, `insfilterNonholonomic`, `insfilterErrorState`); `insfilterAsync` has no sample rate — it is timestamp-driven |
| `tune()` converges to numerically unstable noise | Use returned noise values directly | Clamp very small values before re-running (e.g. `tunedNoise.GPSPositionNoise = max(tunedNoise.GPSPositionNoise, 0.01)`) — the optimizer can find values that cause singularity warnings during the fusion loop |

---

## Advanced Tuning: Controlling Which Parameters Get Tuned

By default `tunerconfig` includes all tunable parameters. Narrow this by editing `TunableParameters` before calling `tune` — useful when some noise values are known from a datasheet and only a subset needs optimization.

`TunableParameters` covers both measurement noise (the fields in `tunernoise`) **and** internal process/state noise parameters (e.g. bias noise, quaternion noise). The two sets have different names.

```matlab
config = tunerconfig('insfilterAsync', 'MaxIterations', 20);

% Remove process-noise parameters you already know well from a datasheet
config.TunableParameters = setdiff(config.TunableParameters, ...
    {'GeomagneticVectorNoise', 'AccelerometerBiasNoise', ...
     'GyroscopeBiasNoise', 'MagnetometerBiasNoise'});

tunedNoise = tune(filt, tunernoise(filt), sensorData, groundTruth, config);
```

The same pattern applies to all Group B filters — replace `'insfilterAsync'` with the appropriate filter name string (`'insfilterMARG'`, `'insfilterNonholonomic'`, `'insfilterErrorState'`). Inspect the full default list with:

```matlab
config = tunerconfig('insfilterMARG');
config.TunableParameters   % shows both measurement and process noise parameters
```

Copyright 2026 The MathWorks, Inc.
