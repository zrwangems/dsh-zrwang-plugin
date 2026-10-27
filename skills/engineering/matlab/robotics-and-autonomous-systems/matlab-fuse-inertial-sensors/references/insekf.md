# insEKF Reference

`insEKF` is a continuous-discrete EKF: state prediction runs continuously, measurement corrections are discrete. It composes a filter from motion and sensor model objects, giving full control over states, sensor types, and fusion logic.

---

## Construction

Pass sensor model objects, a motion model, and (optionally) `insOptions` to `insEKF()`. Order of arguments does not matter except that `insOptions` must be last.

```matlab
% Orientation only (default motion model)
filt = insEKF(insAccelerometer, insGyroscope, insMotionOrientation);

% Full pose: orientation + position + velocity
filt = insEKF(insAccelerometer, insGyroscope, insGPS, insMotionPose);

% Full pose with magnetometer
filt = insEKF(insAccelerometer, insGyroscope, insGPS, insMagnetometer, insMotionPose);

% Custom sensor alongside built-in sensors
customSensor = MyCustomSensorModel;   % subclass positioning.INSSensorModel
filt = insEKF(insAccelerometer, insGyroscope, customSensor, insMotionPose);
```

**Default (no arguments):** `insMotionOrientation` + `{insAccelerometer, insGyroscope}`.

### Setting GPS reference location

`insEKF` has no `ReferenceLocation` property. When using GPS, set `ReferenceLocation` on the **`insGPS` sensor object** before passing it to the constructor. This anchors the GPS→NED coordinate conversion:

```matlab
gpsSensor = insGPS;
gpsSensor.ReferenceLocation = [42.3, -71.1, 100];   % [lat deg, lon deg, alt m]
filt = insEKF(insAccelerometer, insGyroscope, gpsSensor, insMotionPose);
```

The default is `[0, 0, 0]`. If your GPS data uses real LLA coordinates (e.g., latitude 42°N), omitting this produces incorrect position output.

### Setting options at construction time

`ReferenceFrame` and custom sensor names are **read-only after construction**. Set them via `insOptions` before calling `insEKF()`:

```matlab
opts = insOptions(ReferenceFrame="ENU", ...
                  SensorNamesSource="Property", ...
                  SensorNames={'GPS1','GPS2','Accel'});
filt = insEKF(insGPS, insGPS, insAccelerometer, insMotionPose, opts);
```

---

## Inspect State Layout

Always call `stateinfo` before accessing states — the index layout depends on the motion model and sensor set:

```matlab
stateinfo(filt)                             % print all states and their indices
% To query a specific sensor's state index, pass the SAME instance used at construction:
%   accSensor = insAccelerometer;
%   filt = insEKF(accSensor, insGyroscope, insMotionPose);
%   stateinfo(filt, accSensor, 'Bias')      % works because accSensor is the construction instance
```

---

## Fusion Loop (real-time)

```matlab
accSensor  = insAccelerometer;
gyroSensor = insGyroscope;
gpsSensor  = insGPS;
filt = insEKF(accSensor, gyroSensor, gpsSensor, insMotionPose);

% Initialize state
stateparts(filt, 'Orientation', compact(initOrient));
statecovparts(filt, 'Orientation', 1e-2);

dt = 0.01;   % seconds between IMU samples
for i = 1:N
    predict(filt, dt);

    filt.fuse(accSensor,  accel(i,:), Raccel);   % [3x3] noise covariance
    filt.fuse(gyroSensor, gyro(i,:),  Rgyro);

    if gpsAvailable(i)
        filt.fuse(gpsSensor, lla(i,:), Rgps);    % lla: [lat_deg, lon_deg, alt_m]
    end
end

orientation = quaternion(stateparts(filt, 'Orientation'));
position    = stateparts(filt, 'Position');
velocity    = stateparts(filt, 'Velocity');
```

**Prefer dot notation:** `filt.fuse(sensor, meas, R)` is recommended over `fuse(filt, sensor, meas, R)`. Both forms work, but Navigation Toolbox also contains a standalone `fuse` function; if a variable named `fuse` exists in your workspace, it will shadow the method call and cause an error.

---

## State Access

**Always use `stateparts`/`statecovparts` — never access `filt.State` directly.** State indices depend on the motion model and sensors present, so hard-coded indices will break if the filter configuration changes.

### Motion model states (by name)

```matlab
stateparts(filt, 'Orientation')             % returns 1x4 double [w x y z]; wrap with quaternion() for a quaternion object
stateparts(filt, 'Orientation', q)          % set orientation (1x4 compact quaternion)
stateparts(filt, 'Position')                % get position [x y z]
stateparts(filt, 'Velocity')                % get velocity [vx vy vz]
statecovparts(filt, 'Orientation', val)     % set orientation covariance
```

### Sensor states (by sensor handle)

For sensor-specific states (e.g., bias), pass the **same sensor object instance** used at construction:

```matlab
accSensor  = insAccelerometer;
gyroSensor = insGyroscope;
filt = insEKF(accSensor, gyroSensor, insMotionPose);

% Read sensor bias
accBias  = stateparts(filt, accSensor, 'Bias');    % 1x3 accelerometer bias
gyroBias = stateparts(filt, gyroSensor, 'Bias');   % 1x3 gyroscope bias

% Set sensor bias
stateparts(filt, accSensor, 'Bias', [0.01 -0.02 0.005]);
```

**`insEKF` has no `pose()` method.** To retrieve the current navigation state after a fusion loop, use:

```matlab
orientation = quaternion(stateparts(filt, 'Orientation'));
position    = stateparts(filt, 'Position');
velocity    = stateparts(filt, 'Velocity');
```

---

## Batch Fusion (offline)

`estimateStates` runs forward filtering over a timetable, and optionally applies an RTS smoother:

```matlab
% sensorData: timetable with columns named by filt.SensorNames
% measureNoise: struct from tunernoise(filt), or a manually constructed struct
estimates = estimateStates(filt, sensorData, measureNoise);

% Request smoothed estimates (RTS smoother — more memory and compute)
[estimates, smoothEstimates] = estimateStates(filt, sensorData, measureNoise);
```

Both outputs are timetables of states (same format as `filt.SensorNames`). `smoothEstimates` is the RTS-smoothed result; use it when you need the best offline accuracy.

**Heading-unconstrained configurations (6-axis IMU, no magnetometer):** Default `tunernoise` parameters give large heading errors in batch estimation because heading drift is unconstrained. Tune noise before calling `estimateStates`:

```matlab
measureNoise = tunernoise(filt);
cfg = tunerconfig(filt, MaxIterations=50);
measureNoise = tune(filt, measureNoise, sensorData, groundTruth, cfg);
estimates = estimateStates(filt, sensorData, measureNoise);
```

Without tuning, heading error from `estimateStates` can be large on 6-axis IMU data.

---

## Tuning

```matlab
measureNoise = tunernoise(filt);              % fields named {SensorName}Noise: AccelerometerNoise, GyroscopeNoise, GPSNoise, etc.
cfg = tunerconfig(filt, MaxIterations=200);   % requires filter INSTANCE, not string

% Reinitialize before tuning
stateparts(filt, 'Orientation', compact(initOrient));
statecovparts(filt, 'Orientation', 1e-2);

tunedNoise = tune(filt, measureNoise, sensorData, groundTruth, cfg);

% Apply tuned noise in batch estimate
tunedStates = estimateStates(filt, sensorData, tunedNoise);
```

### Controlling Which Parameters Get Tuned

`TunableParameters` defaults to a cell array for `insEKF`. Each cell is either a string (tune all elements together) or a `{propertyName, indices}` pair (tune specific diagonal elements):

```matlab
config = tunerconfig(filt);

% Inspect defaults — AdditiveProcessNoise is tuned element-by-element (diagonals)
config.TunableParameters
% {{'AdditiveProcessNoise', [1 15 29 ...]}, 'AccelerometerNoise', 'GyroscopeNoise'}

% Tune only AccelerometerNoise and GyroscopeNoise (drop process noise)
config.TunableParameters = {'AccelerometerNoise', 'GyroscopeNoise'};

tunedNoise = tune(filt, tunernoise(filt), sensorData, groundTruth, config);
```

### Custom Cost Function

Use when RMS error on orientation/position is not the right objective (e.g. you care more about velocity accuracy). Use `createTunerCostTemplate` to get a starter function signature:

```matlab
createTunerCostTemplate(filt)
```

Then wire it in via `tunerconfig`:

```matlab
config = tunerconfig(filt);
config.Cost = 'Custom';
config.CustomCostFcn = @myCostFcn;

tunedNoise = tune(filt, tunernoise(filt), sensorData, groundTruth, config);

% CustomCostFcn receives 3 inputs: (filter, measNoise, sensorData)
% groundTruth is NOT passed — load/access your own reference inside the function
function cost = myCostFcn(filter, measNoise, sensorData)
    states = estimateStates(filter, sensorData, measNoise);
    velError = states.Velocity - myGroundTruthVelocity;
    cost = rms(vecnorm(velError, 2, 2));
end
```

### OutputFcn — Logging and Early Stopping

`OutputFcn` is called after each iteration. Return `true` to stop early. Applies to all tunable filters, not just `insEKF`.

```matlab
config = tunerconfig(filt);
config.OutputFcn = @(params, info) logAndStop(params, info);

function stop = logAndStop(params, info)
    fprintf('Iter %d: cost = %.4f\n', info.Iteration, info.Cost);
    stop = info.Cost < 0.05;   % stop early if good enough
end
```

`info` fields: `Iteration`, `SensorData`, `GroundTruth`, `Configuration`, `Cost`.

---

## Motion Models

| Model                       | States added                                          | Use when                                    |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `insMotionOrientation`      | Orientation, AngularVelocity                          | Attitude only; no position needed           |
| `insMotionPose`             | Orientation, AngularVelocity, Position, Velocity, Acceleration | Full navigation (position + velocity + attitude) |
| `positioning.INSMotionModel` | User-defined                                         | Custom dynamics (e.g. constant-velocity, bicycle model) |

---

## Sensor Models

| Model                        | Measures                              | Notes                                           |
| ---------------------------- | ------------------------------------- | ----------------------------------------------- |
| `insAccelerometer`           | Specific force + bias                 | Models gravity + acceleration when in state     |
| `insGyroscope`               | Angular velocity + bias               |                                                 |
| `insMagnetometer`            | Geomagnetic vector + bias             |                                                 |
| `insGPS`                     | LLA position (+ velocity if fused)    | Multiple GPS objects supported; auto-named GPS, GPS_1, ... |
| `positioning.INSSensorModel` | User-defined                          | Subclass; must implement `measurement` method   |

---

## Custom Motion Model

Subclass `positioning.INSMotionModel` and implement `modelstates` and `stateTransition`:

```matlab
classdef MyMotionModel < positioning.INSMotionModel
    methods
        function states = modelstates(obj)
            % Return Nx1 string array of state names
            states = ["X"; "Y"; "Heading"];
        end
        function [state, F] = stateTransition(obj, state, dt, varargin)
            % Propagate state forward; return updated state and Jacobian F
        end
        function jac = stateTransitionJacobian(obj, filter, dt, varargin)
            % Return S-by-N Jacobian matrix for the state transition
        end
    end
end
```

---

## Gotchas Summary

| Situation                              | Wrong                              | Correct                                   |
| -------------------------------------- | ---------------------------------- | ----------------------------------------- |
| Getting orientation from state         | `filt.State(1:4)`                  | `stateparts(filt, 'Orientation')`         |
| Getting pose after fusion loop         | `pose(filt)` or `[pos, orient] = pose(filt)` | `insEKF` has no `pose()` method — use `stateparts(filt, 'Position')`, `stateparts(filt, 'Orientation')`, `stateparts(filt, 'Velocity')` |
| Accessing sensor bias                  | `filt.State(idx:idx+2)`            | `stateparts(filt, sensorHandle, 'Bias')` — pass the same object instance used at construction |
| Accessing a state not in motion model  | `stateparts(filt, 'Position')` when constructed with `insMotionOrientation` | Call `stateinfo(filt)` first — `insMotionOrientation` has no `Position`/`Velocity` states; use `insMotionPose` if you need them |
| Creating tuner config                  | `tunerconfig('insEKF')`            | `tunerconfig(filt)`                       |
| Setting ENU reference frame            | `filt.ReferenceFrame = "ENU"`      | `insOptions(ReferenceFrame="ENU")` at construction |
| Setting GPS reference location         | `filt.ReferenceLocation = lla0`    | `gpsSensor.ReferenceLocation = lla0` on the `insGPS` object |
| Noise struct field names               | `measureNoise.Accelerometer = ...` | `measureNoise.AccelerometerNoise = ...` (suffix `Noise`) |

Copyright 2026 The MathWorks, Inc.