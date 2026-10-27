# Mobility Models Reference

## addMobility

Add mobility to wireless nodes. Accepts individual nodes or node vectors.

```matlab
addMobility(nodes, Name=Value)
```

## Models

| Model | Description | Best For |
|-------|-------------|----------|
| `"random-waypoint"` | Move to random point, pause, repeat | General mobility, pedestrians |
| `"random-walk"` | Change direction/speed at time or distance intervals | Dense indoor, Brownian motion |
| `"constant-velocity"` | Fixed velocity vector, no direction changes | Vehicles, conveyor belts |

## Parameters

| Parameter | Default | Applies To | Description |
|-----------|---------|------------|-------------|
| `MobilityModel` | `"random-waypoint"` | All | Model type |
| `SpeedRange` | `[0.415 1.66]` | random-waypoint, random-walk | Speed range in m/s |
| `PauseDuration` | 0 | random-waypoint | Pause at waypoint (seconds) |
| `BoundaryShape` | `"rectangle"` | random-waypoint, random-walk | `"rectangle"` or `"circle"` |
| `Bounds` | — | random-waypoint, random-walk | Mobility area (see below) |
| `WalkMode` | `"time"` | random-walk | Change trigger: `"time"` or `"distance"` |
| `Time` | 1 | random-walk (time mode) | Seconds between direction changes |
| `Distance` | 1 | random-walk (distance mode) | Meters between direction changes |
| `Velocity` | `[0 0 0]` | constant-velocity | Velocity vector in m/s |
| `RefreshInterval` | 0.1 | All | Position update interval (seconds) |

## Bounds Format

**Rectangle:** `Bounds = [x_center, y_center, width, height]`

The bounds define a rectangle centered at `(x_center, y_center)` with the given width and height.

**Containment rule:** Every node's initial position must be inside the bounds:
- `x_center - width/2 ≤ node_x ≤ x_center + width/2`
- `y_center - height/2 ≤ node_y ≤ y_center + height/2`

**Circle:** `Bounds = [x_center, y_center, radius]`

### Computing Bounds from Node Positions

```matlab
positions = vertcat(nodes.Position);  % N×3

xMin = min(positions(:,1)); xMax = max(positions(:,1));
yMin = min(positions(:,2)); yMax = max(positions(:,2));

cx = (xMin + xMax) / 2;
cy = (yMin + yMax) / 2;
w = (xMax - xMin) + 2;  % +2m margin
h = (yMax - yMin) + 2;

addMobility(nodes, MobilityModel="random-waypoint", ...
    SpeedRange=[1.0 1.5], Bounds=[cx cy w h]);
```

## Speed Guidelines

Walking indoor: `[0.8 1.5]`, outdoor: `[1.0 1.8]`, jogging: `[2.0 3.5]`, cycling: `[3.0 8.0]`, vehicle: `[5.0 15.0]` m/s.

<!-- Copyright 2026 The MathWorks, Inc. -->
