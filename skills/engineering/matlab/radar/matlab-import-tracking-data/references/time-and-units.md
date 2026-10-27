# Time Parsing and Unit Conversions

## Time Formats

### Numeric Epoch (DateTime)

Large numeric values (> 1e8) are likely POSIX epoch seconds:

```matlab
epochSec = rawTable.("timestamp");
dt = datetime(epochSec, 'ConvertFrom', 'posixtime');
simTime = seconds(dt - dt(1));  % zero-initialized elapsed seconds
```

Other epoch bases:
```matlab
% Excel serial date number
dt = datetime(rawTable.("datenum"), 'ConvertFrom', 'datenum');

% Milliseconds since epoch
dt = datetime(rawTable.("timestamp_ms") / 1000, 'ConvertFrom', 'posixtime');

% GPS time (seconds since 1980-01-06)
dt = datetime(rawTable.("gps_time"), 'ConvertFrom', 'posixtime') + seconds(315964800);
```

### Numeric Elapsed (Duration)

Small numeric values (starting near 0 or monotonically increasing from a small base) are elapsed seconds:

```matlab
timeSec = rawTable.("time");
simTime = timeSec - timeSec(1);  % zero-initialize
```

### Text DateTime

```matlab
% ISO 8601
dt = datetime(rawTable.("datetime"), 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss.SSS');

% Custom format
dt = datetime(rawTable.("time_str"), 'InputFormat', 'dd/MM/yyyy HH:mm:ss');

% Then convert to elapsed seconds
simTime = seconds(dt - dt(1));
```

### Already datetime

If the table column is already a `datetime` array (e.g., from timetable):

```matlab
dt = rawTable.("Time");  % already datetime
simTime = seconds(dt - dt(1));
```

## Detecting Time Type

| Clue | Interpretation |
|---|---|
| Values > 1e8 | POSIX epoch (seconds since 1970) |
| Values > 1e11 | Epoch in milliseconds — divide by 1000 |
| Values start near 0, monotonically increase | Elapsed seconds |
| String with date separators (`-`, `/`) | Text datetime |
| Column is `datetime` type | Already parsed |
| Column name contains "epoch" | POSIX epoch |
| Column name contains "elapsed", "duration" | Elapsed seconds |

## Zero-Initialization

All output formats require time starting at 0:

```matlab
% For datetime-based time
simTime = seconds(dt - min(dt));

% For numeric elapsed time
simTime = timeSec - min(timeSec);
```

## Unit Conversions

### Length / Altitude

| From | To | Conversion |
|---|---|---|
| feet (ft) | meters (m) | `× 0.3048` |
| nautical miles (nm) | meters (m) | `× 1852` |
| kilometers (km) | meters (m) | `× 1000` |
| miles (mi) | meters (m) | `× 1609.344` |
| inches (in) | meters (m) | `× 0.0254` |

### Speed / Velocity

| From | To | Conversion |
|---|---|---|
| knots (kts) | m/s | `× 0.514444` |
| km/h (kph) | m/s | `× (1/3.6)` |
| mph | m/s | `× 0.44704` |
| ft/s | m/s | `× 0.3048` |
| ft/min | m/s | `× 0.00508` |

### Angles

| From | To | Conversion |
|---|---|---|
| degrees (deg) | radians (rad) | `deg2rad()` |
| radians (rad) | degrees (deg) | `rad2deg()` |

### Angular Velocity

| From | To | Conversion |
|---|---|---|
| deg/s | rad/s | `deg2rad()` |
| rpm | rad/s | `× (2π/60)` |

### Acceleration

| From | To | Conversion |
|---|---|---|
| g | m/s² | `× 9.80665` |
| ft/s² | m/s² | `× 0.3048` |

## Detecting Units from Column Names

Look for unit hints in column names:

| Pattern in Name | Inferred Unit |
|---|---|
| `_ft`, `(ft)`, `_feet` | feet |
| `_kts`, `(kts)`, `_knots` | knots |
| `_deg`, `(deg)`, `_degrees` | degrees |
| `_rad`, `(rad)`, `_radians` | radians |
| `_nm`, `(nm)` | nautical miles |
| `_kmh`, `_kph`, `(km/h)` | km/h |
| `_mph`, `(mph)` | mph |
| `_g`, `(g)` | g-force |

## Default Units (when no hint)

| State Element | Default Unit |
|---|---|
| Latitude, Longitude | degrees |
| Altitude, Position | meters |
| Velocity | m/s |
| Acceleration | m/s² |
| Yaw, Pitch, Roll, Course | degrees |
| Angular Velocity | rad/s |
| Angular Acceleration | rad/s² |
| Dimensions (L/W/H) | meters |
| Quaternion | unitless |


----

Copyright 2026 The MathWorks, Inc.
