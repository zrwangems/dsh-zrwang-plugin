# Data Model Categories

## Category Selection Guide

| Data Looks Like | Category | Coordinate | Frame |
|---|---|---|---|
| Lat/lon + heading/pitch/roll, aircraft data | **FlightLog** | Geodetic | Local NED |
| Lat/lon only, GPS positions | **GPSLog** | Geodetic | Local NED |
| x/y/z positions, vehicle/driving data | **DrivingLog** | Cartesian | Ego |
| Lat/lon + custom state set | **Custom Geodetic** | Geodetic | varies |
| x/y/z + custom state set | **Custom Cartesian** | Cartesian | varies |

## FlightLog

Geodetic, box extent (has dimensions), Local NED frame.

### State Elements

| ID | Name | Group | Unit | Required |
|---|---|---|---|---|
| t_epoch | Time (DateTime) | Time | sec (posix epoch) | **Yes** |
| pid | Platform ID | ID | — | No |
| cid | Class ID | ID | — | No |
| lat | Latitude | Position | degree | **Yes** |
| long | Longitude | Position | degree | **Yes** |
| alt | Altitude | Position | m | No |
| vx, vy, vz | Velocity (N/E/D) | Velocity | m/s | No |
| speed | Speed | Velocity | m/s | No |
| course | Course | Velocity | degree | No |
| climb_rate | Climb Rate | Velocity | m/s | No |
| ax, ay, az | Acceleration (N/E/D) | Acceleration | m/s² | No |
| yaw | Yaw (Heading) | Orientation | degree | No |
| pitch | Pitch | Orientation | degree | No |
| roll | Roll | Orientation | degree | No |
| q0, q1, q2, q3 | Quaternion parts | Orientation | — | No |
| omegax, omegay, omegaz | Angular Velocity | Angular Velocity | rad/s | No |

**Velocity options**: Either (vx, vy, vz) or (speed, course, climb_rate), not both.

## GPSLog

Geodetic, point extent (no dimensions), Local NED frame.

### State Elements

| ID | Name | Group | Unit | Required |
|---|---|---|---|---|
| t_epoch | Time (DateTime) | Time | sec (posix epoch) | **Yes** |
| pid | Platform ID | ID | — | No |
| cid | Class ID | ID | — | No |
| lat | Latitude | Position | degree | **Yes** |
| long | Longitude | Position | degree | **Yes** |
| alt | Altitude | Position | m | No |
| vx, vy, vz | Velocity (N/E/D) | Velocity | m/s | No |
| speed | Speed | Velocity | m/s | No |
| course | Course | Velocity | degree | No |
| climb_rate | Climb Rate | Velocity | m/s | No |
| ax, ay, az | Acceleration (N/E/D) | Acceleration | m/s² | No |

No orientation or angular velocity for GPS logs.

## DrivingLog (Ego)

Cartesian, box extent (has dimensions), Ego frame.

### State Elements

| ID | Name | Group | Unit | Required |
|---|---|---|---|---|
| t_epoch | Time (DateTime) | Time | sec (posix epoch) | **Yes** |
| pid | Platform ID | ID | — | No |
| cid | Class ID | ID | — | No |
| x | X Position | Position | m | **Yes** |
| y | Y Position | Position | m | **Yes** |
| z | Z Position | Position | m | No |
| vx, vy, vz | Velocity | Velocity | m/s | No |
| ax, ay, az | Acceleration | Acceleration | m/s² | No |
| yaw | Yaw | Orientation | degree | No |
| pitch | Pitch | Orientation | degree | No |
| roll | Roll | Orientation | degree | No |
| q0, q1, q2, q3 | Quaternion parts | Orientation | — | No |
| omegax, omegay, omegaz | Angular Velocity | Angular Velocity | rad/s | No |
| alphax, alphay, alphaz | Angular Acceleration | Angular Accel | rad/s² | No |
| len | Length | Dimension | m | No |
| width | Width | Dimension | m | No |
| height | Height | Dimension | m | No |
| offx, offy, offz | Origin Offset | Dimension | m | No |

## Custom Categories

Custom interpreters support any combination of:

- **Coordinate**: Geodetic or Cartesian
- **Frame**: Scenario, ECEF, Fixed NED, Fixed ENU, Local NED, Local ENU
- **Extent**: Point (no dimensions) or Box (with dimensions)

State elements match the geodetic set (FlightLog-like) for Geodetic customs, or Cartesian set (DrivingLog-like) for Cartesian customs.

**Fixed NED/ENU** frames require an origin (lat0, lon0, alt0) for coordinate transforms.

## Column Name Pattern Matching

When auto-inferring mappings, match column names to state elements using these patterns:

| State | Column Name Patterns |
|---|---|
| Time | `time`, `timestamp`, `t`, `epoch`, `datetime`, `date_time` |
| Platform ID | `id`, `pid`, `platform_id`, `aircraft_id`, `object_id`, `track_id`, `vehicle_id` |
| Class ID | `class`, `class_id`, `cid`, `type`, `category` |
| Latitude | `lat`, `latitude` |
| Longitude | `lon`, `long`, `longitude`, `lng` |
| Altitude | `alt`, `altitude`, `height`, `elev`, `elevation` |
| X Position | `x`, `pos_x`, `position_x`, `px` |
| Y Position | `y`, `pos_y`, `position_y`, `py` |
| Z Position | `z`, `pos_z`, `position_z`, `pz` |
| Velocity N/X | `vn`, `vx`, `vel_n`, `vel_x`, `velocity_n`, `velocity_x` |
| Velocity E/Y | `ve`, `vy`, `vel_e`, `vel_y`, `velocity_e`, `velocity_y` |
| Velocity D/Z | `vd`, `vz`, `vel_d`, `vel_z`, `velocity_d`, `velocity_z` |
| Speed | `speed`, `groundspeed`, `ground_speed`, `spd` |
| Course | `course`, `heading`, `track_angle`, `cog` |
| Climb Rate | `climb_rate`, `vertical_speed`, `vs`, `roc` |
| Acceleration | `ax`, `ay`, `az`, `acc_x`, `acc_y`, `acc_z` |
| Yaw | `yaw`, `heading`, `psi`, `azimuth` |
| Pitch | `pitch`, `theta`, `elevation_angle` |
| Roll | `roll`, `phi`, `bank` |
| Quaternion | `q0`/`qw`, `q1`/`qx`, `q2`/`qy`, `q3`/`qz` |
| Angular Vel | `omegax`, `omegay`, `omegaz`, `wx`, `wy`, `wz`, `gyro_x`, `gyro_y`, `gyro_z` |
| Length | `len`, `length`, `l` |
| Width | `width`, `w` |
| Height | `height`, `h` |


----

Copyright 2026 The MathWorks, Inc.
