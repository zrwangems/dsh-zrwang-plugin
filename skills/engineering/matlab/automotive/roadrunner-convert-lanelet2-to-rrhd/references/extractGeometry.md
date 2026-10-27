# Reference: Extract Geometry

## Description
Resolves way geometries from node coordinates and synthesizes center lines from left/right boundaries. Uses `local_x`/`local_y` from node tags if available. Otherwise computes ENU from lat/lon relative to the geographic reference point (centroid of all nodes).

## Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `ways` | containers.Map | Parsed ways with nodeRefs |
| `nodes` | containers.Map | Parsed nodes with x, y, z |
| `geoRef` | [lat, lon] | Reference point for ENU transform |

## Output
Per-lanelet: `leftGeom`, `rightGeom`, `centerGeom` — all Nx3 double [x, y, z] in ENU meters.

## MANDATORY: Center Line Synthesis Pipeline

**Never use simple `min(nPts)` truncation.** Always follow this exact pipeline:

### Step 1: Detect Opposing Boundary Directions
```matlab
leftDir = leftGeom(end,:) - leftGeom(1,:);
rightDir = rightGeom(end,:) - rightGeom(1,:);
if dot(leftDir(1:2), rightDir(1:2)) < 0
    rightGeom = flipud(rightGeom);  % flip to match direction
end
```

### Step 2: Arc-Length Pchip Resampling to max(nPts)
Both boundaries resampled to the MAXIMUM point count (preserves curve information):
```matlab
nTarget = max(size(leftGeom,1), size(rightGeom,1));

% Resample left boundary
dL = diff(leftGeom);
segLenL = sqrt(sum(dL.^2, 2));
cumLenL = [0; cumsum(segLenL)];
tNormL = cumLenL / cumLenL(end);  % normalized arc-length [0,1]
tTarget = linspace(0, 1, nTarget)';
leftResampled = zeros(nTarget, 3);
for dim = 1:3
    leftResampled(:,dim) = interp1(tNormL, leftGeom(:,dim), tTarget, 'pchip');
end

% Resample right boundary (same pattern)
dR = diff(rightGeom);
segLenR = sqrt(sum(dR.^2, 2));
cumLenR = [0; cumsum(segLenR)];
tNormR = cumLenR / cumLenR(end);
rightResampled = zeros(nTarget, 3);
for dim = 1:3
    rightResampled(:,dim) = interp1(tNormR, rightGeom(:,dim), tTarget, 'pchip');
end
```

### Step 3: Midpoint Averaging
```matlab
centerGeom = (leftResampled + rightResampled) / 2;
```

### Step 4: Orthogonal Endpoint Enforcement
**Only for lanes with >= 4 points** (skip short intersection connectors to avoid distortion):

```matlab
if size(centerGeom, 1) >= 4
    % Place endpoints at exact boundary midpoints
    centerGeom(1,:) = (leftResampled(1,:) + rightResampled(1,:)) / 2;
    centerGeom(end,:) = (leftResampled(end,:) + rightResampled(end,:)) / 2;

    % Start tangent: 50% blend toward orthogonal
    crossStart = rightResampled(1,:) - leftResampled(1,:);
    crossNorm = norm(crossStart(1:2));
    if crossNorm > 1e-6
        crossStart2D = crossStart(1:2) / crossNorm;
        desiredTan = [-crossStart2D(2), crossStart2D(1)];  % perpendicular

        % Ensure same general direction as lane
        laneOverall = centerGeom(end,1:2) - centerGeom(1,1:2);
        if dot(desiredTan, laneOverall) < 0
            desiredTan = -desiredTan;
        end

        origVec = centerGeom(2,:) - centerGeom(1,:);
        origDist = norm(origVec);
        if origDist > 1e-6
            origDir2D = origVec(1:2) / norm(origVec(1:2));
            blended2D = 0.5 * origDir2D + 0.5 * desiredTan;
            blended2D = blended2D / norm(blended2D);
            zSlope = origVec(3) / origDist;
            centerGeom(2,:) = centerGeom(1,:) + [blended2D * origDist, zSlope * origDist];
        end
    end

    % End tangent: same 50% blend (mirror logic)
    crossEnd = rightResampled(end,:) - leftResampled(end,:);
    crossNorm = norm(crossEnd(1:2));
    if crossNorm > 1e-6
        crossEnd2D = crossEnd(1:2) / crossNorm;
        desiredTan = [-crossEnd2D(2), crossEnd2D(1)];
        if dot(desiredTan, laneOverall) < 0
            desiredTan = -desiredTan;
        end

        origVec = centerGeom(end,:) - centerGeom(end-1,:);
        origDist = norm(origVec);
        if origDist > 1e-6
            origDir2D = origVec(1:2) / norm(origVec(1:2));
            blended2D = 0.5 * origDir2D + 0.5 * desiredTan;
            blended2D = blended2D / norm(blended2D);
            zSlope = origVec(3) / origDist;
            centerGeom(end-1,:) = centerGeom(end,:) - [blended2D * origDist, zSlope * origDist];
        end
    end
end
```

## Verification Criteria
After synthesis, check orthogonality at endpoints:
```matlab
% dot(cross-lane direction, tangent) should be near 0
crossStart = rightResampled(1,:) - leftResampled(1,:);
tanStart = centerGeom(2,:) - centerGeom(1,:);
orthCheck = dot(crossStart(1:2)/norm(crossStart(1:2)), tanStart(1:2)/norm(tanStart(1:2)));
% |orthCheck| < 0.05 is acceptable
```

## MANDATORY: Guard for Degenerate Boundaries

Before calling `interp1`, verify boundaries have non-zero arc length. Closed-loop rotation or duplicate removal can produce zero-length boundaries that cause `interp1` to error with "X and V must be of the same length" or "sample points must be finite."

```matlab
% Remove consecutive duplicate points BEFORE resampling
keepL = [true; vecnorm(diff(leftGeom),2,2) > 1e-6];
leftGeom = leftGeom(keepL,:);
keepR = [true; vecnorm(diff(rightGeom),2,2) > 1e-6];
rightGeom = rightGeom(keepR,:);

% Guard: skip interp1 if boundary has < 2 points or zero length
sL = vecnorm(diff(leftGeom),2,2); cumLenL = [0; cumsum(sL)];
if size(leftGeom,1) < 2 || cumLenL(end) < 1e-4
    % Fallback: use simple midpoint for center line
    centerGeom = [(leftGeom(1,:)+rightGeom(1,:))/2; (leftGeom(end,:)+rightGeom(end,:))/2];
    continue;  % skip to next lanelet
end

% Ensure strictly increasing parameterization (handles floating-point ties)
tNormL = cumLenL / cumLenL(end);
for k = 2:numel(tNormL)
    if tNormL(k) <= tNormL(k-1), tNormL(k) = tNormL(k-1) + 1e-10; end
end
```

## Common Failures This Prevents
| Failure Mode | Root Cause |
|---|---|
| Center line overshoots boundary at curved ends | Simple truncation lost curve info |
| Grass/gap at lane connections | Non-orthogonal endpoint misaligns with successor |
| Center line zigzags at mismatched boundaries | Linear interp instead of pchip |
| Lane_N has fewer points than its longest boundary | Used min(nPts) instead of max(nPts) |
| `interp1` "X and V must be of same length" | Zero-length boundary after closed-loop rotation |
| `interp1` "sample points must be finite" | Duplicate points causing `0/0 = NaN` in normalization |

----

Copyright 2026 The MathWorks, Inc.
