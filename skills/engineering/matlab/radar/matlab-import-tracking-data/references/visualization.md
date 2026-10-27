# Visualization

## Geo Data → trackingGlobeViewer

For geodetic/ECEF data, use `trackingGlobeViewer` to show trajectories on a 3D globe.

### Basic Setup

`plotPlatform` expects a struct array where each element has `PlatformID` and `Position` (ECEF).
Set `PlatformHistoryDepth` on the viewer to the number of entries so the full trajectory trail is retained.

```matlab
% Convert LLA to ECEF
[xE, yE, zE] = geodetic2ecef(wgs84Ellipsoid, lat, lon, alt);
posECEF = [xE yE zE];

N = size(posECEF, 1);

% Build struct array
platStructs = struct('PlatformID', num2cell(ones(N,1)), ...
                     'Position', num2cell(posECEF, 2));

% Create viewer with history depth = number of data points
viewer = trackingGlobeViewer(PlatformHistoryDepth=N);

% Plot trajectory using History mode
% flip() places the label at the start of the trajectory
viewer.plotPlatform(flip(platStructs), "ECEF", ...
    TrajectoryMode="History", LineWidth=2, Marker="");
```

### Multiple Platforms

```matlab
uniquePIDs = unique(platformIDs, 'stable');
colors = lines(numel(uniquePIDs));
totalPoints = numel(platformIDs);
viewer = trackingGlobeViewer(PlatformHistoryDepth=totalPoints);

for ii = 1:numel(uniquePIDs)
    idx = platformIDs == uniquePIDs(ii);
    plats = struct('PlatformID', num2cell(repmat(uniquePIDs(ii), sum(idx), 1)), ...
                   'Position', num2cell(posECEF(idx,:), 2));
    viewer.plotPlatform(flip(plats), "ECEF", ...
        TrajectoryMode="History", Color=colors(ii,:), ...
        LineWidth=2, Marker="");
end
```

### Position Format

`plotPlatform` expects ECEF positions (1x3 per struct element, in meters). If you have geodetic LLA, convert first:

```matlab
[xE, yE, zE] = geodetic2ecef(wgs84Ellipsoid, lat, lon, alt);
posECEF = [xE yE zE];
```

### TrajectoryMode Options

| Mode | Effect |
|---|---|
| `"History"` | Show trajectory trail (use with struct array for full path) |
| `"None"` | Show only current position marker (no trail) |

**Note:** `"Full"` mode is not compatible with struct inputs. Use `"History"` with `PlatformHistoryDepth` set to the number of data points to display the entire trajectory.

### Camera Control

```matlab
% Set camera position (lat, lon, alt in meters)
campos(viewer, lat0, lon0, altCamera);

% Set camera orientation [heading, pitch, roll] in degrees
camorient(viewer, [heading pitch roll]);

% Zoom to fit all data — compute center of trajectories
meanLLA = mean([lat lon alt], 1);
campos(viewer, meanLLA(1), meanLLA(2), max(alt)*5);
```

### Basemap

```matlab
% Change basemap style
viewer.Basemap = "satellite";   % or "streets", "topographic", "darkwater"
```

### Highlighting a Platform

```matlab
% Highlight one platform in red, others in blue
for ii = 1:numel(uniquePIDs)
    idx = platformIDs == uniquePIDs(ii);
    plats = struct('PlatformID', num2cell(repmat(uniquePIDs(ii), sum(idx), 1)), ...
                   'Position', num2cell(posECEF(idx,:), 2));
    if uniquePIDs(ii) == highlightPID
        color = [1 0 0]; lw = 3;
    else
        color = [0.3 0.5 1]; lw = 1;
    end
    viewer.plotPlatform(flip(plats), "ECEF", ...
        TrajectoryMode="History", Color=color, LineWidth=lw, Marker="");
end
```

### Showing a Time Step

```matlab
% Show positions at a specific time (no trajectory trail)
tIdx = find(simTime == targetTime);
plats = struct('PlatformID', num2cell(platformIDs(tIdx)), ...
               'Position', num2cell(posECEF(tIdx,:), 2));
viewer.plotPlatform(plats, "ECEF", ...
    TrajectoryMode="None", Color=[1 0 0]);
```

---

## Non-Geo Data → theaterPlot

For Cartesian/Scenario-frame data, use `theaterPlot` for 3D visualization.

### Basic Setup

```matlab
tp = theaterPlot('XLimits', [xmin xmax], 'YLimits', [ymin ymax], 'ZLimits', [zmin zmax]);

% Create plotters
trajPlotter = trajectoryPlotter(tp, 'DisplayName', 'Trajectories', 'LineWidth', 2);
platPlotter = platformPlotter(tp, 'DisplayName', 'Platforms', 'MarkerSize', 8);
```

### Plot Trajectories

`plotTrajectory` expects a cell array of Nx3 position matrices (one per platform):

```matlab
uniquePIDs = unique(platformIDs, 'stable');
trajData = cell(1, numel(uniquePIDs));
for ii = 1:numel(uniquePIDs)
    idx = platformIDs == uniquePIDs(ii);
    trajData{ii} = pos(idx, :);
end
plotTrajectory(trajPlotter, trajData);
```

### Plot Current Positions

```matlab
% Positions at a given time step
tIdx = find(simTime == targetTime);
currentPos = pos(tIdx, :);
plotPlatform(platPlotter, currentPos);
```

### With Dimensions and Orientation

```matlab
% dims: Nx3 [length width height]
% ori: Nx1 quaternion array
plotPlatform(platPlotter, currentPos, dims, ori);
```

### Axis Labels

```matlab
xlabel('X (m)'); ylabel('Y (m)'); zlabel('Z (m)');
title('Platform Trajectories');
view(3);  % 3D view
grid on;
```

---

## Interactive Follow-Ups to Offer

After showing the visualization, offer the user these options:

1. **Highlight a platform**: "Want me to highlight a specific platform ID?"
2. **Show a time step**: "Want to see positions at a specific time?"
3. **Change view**: "Want to zoom in on a region or change the camera angle?"
4. **Animate**: "Want me to animate the trajectories over time?"
5. **Change basemap** (geo only): "Want a different basemap (satellite, streets, topographic)?"


----

Copyright 2026 The MathWorks, Inc.
