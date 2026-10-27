# Physical Constraint Verification

Verify that channel parameters come from a real satellite scenario, not
hand-rolled constants. Run these checks after Step 3 of the workflow.

## Expected Ranges

### MEO Constellations (GPS, Galileo)

| Parameter | Range | Source |
|-----------|-------|--------|
| Visible satellites | 4-18 (GPS typically 6-12, Galileo up to 18) | Constellation geometry |
| Doppler (L1/E1) | ±10 kHz | Orbital velocity ~3.87 km/s |
| Doppler (L2) | ±8 kHz | Lower carrier frequency |
| Doppler (L5/E5a) | ±7.5 kHz | Lowest carrier frequency |
| Propagation delay | 67-86 ms | MEO orbit ~20,200 km altitude |
| SNR per satellite | -15 to -5 dB (typical) | Free-space path loss |

### GEO/GSO Constellation (NavIC)

| Parameter | Range | Source |
|-----------|-------|--------|
| Visible satellites | 4-7 | Regional constellation (India-centric) |
| Doppler (L5) | ±500 Hz (GEO), ±2 kHz (GSO) | Near-stationary GEO, inclined GSO |
| Propagation delay | 119-130 ms | GEO orbit ~35,786 km altitude |
| SNR per satellite | -15 to -5 dB (typical) | Free-space path loss |

## Full Verification Code

```matlab
function verifyScenarioChannelParams(dopShifts, ltncy, satIndices, centerFrequency, options)
%verifyScenarioChannelParams Check that channel params are physically realistic.
%   Fails with descriptive error if any parameter is outside expected range.
%   Supports GPS/Galileo (MEO) and NavIC (GEO/GSO) constellations.

    arguments
        dopShifts (:,:) double
        ltncy (:,:) double
        satIndices (1,:) double {mustBePositive, mustBeInteger}
        centerFrequency (1,1) double {mustBePositive}
        options.Constellation (1,1) string ...
            {mustBeMember(options.Constellation, ["GPS", "Galileo", "NavIC"])} = "GPS"
    end

    dopVisible = dopShifts(:, satIndices);
    delayVisible = ltncy(:, satIndices);
    numVisible = length(satIndices);

    % Set constellation-specific ranges
    switch options.Constellation
        case {"GPS", "Galileo"}
            minSats = 4;
            maxSats = 14;
            minDelay = 0.060;  % 60 ms
            maxDelay = 0.095;  % 95 ms
            maxVelocity = 3870;  % m/s (MEO orbital velocity)
        case "NavIC"
            minSats = 4;
            maxSats = 7;
            minDelay = 0.115;  % 115 ms
            maxDelay = 0.130;  % 130 ms
            maxVelocity = 3100;  % m/s (GSO orbital velocity, GEO is near-zero)
    end

    % 1. Visible satellite count
    assert(numVisible >= minSats && numVisible <= maxSats, ...
        "Expected %d-%d visible satellites, got %d", minSats, maxSats, numVisible);

    % 2. Doppler within physical limits
    maxDoppler = maxVelocity * centerFrequency / physconst("LightSpeed") * 1.3;
    assert(all(abs(dopVisible(:)) < maxDoppler), ...
        "Doppler %.1f Hz exceeds physical limit %.1f Hz", ...
        max(abs(dopVisible(:))), maxDoppler);

    % 3. Propagation delay in orbit range
    assert(all(delayVisible(:) > minDelay & delayVisible(:) < maxDelay), ...
        "Delay outside %s orbit range [%.0f-%.0f ms]", ...
        options.Constellation, minDelay*1000, maxDelay*1000);

    % 4. Each satellite has distinct Doppler
    uniqueDop = length(unique(round(dopVisible(1,:))));
    assert(uniqueDop == numVisible, ...
        "Expected %d unique Doppler values, got %d", numVisible, uniqueDop);

    % 5. Doppler varies over time
    if size(dopVisible, 1) > 1
        dopChange = dopVisible(end,:) - dopVisible(1,:);
        assert(any(abs(dopChange) > 0.001), ...
            "Doppler should change over time (orbital dynamics)");
    end

    fprintf("All physical constraint checks passed (%d %s satellites).\n", ...
        numVisible, options.Constellation);
end
```

## Quick Inline Check

For a fast check without the full function:

```matlab
dopVisible = dopShifts(:, satIndices);
delayVisible = ltncy(:, satIndices);

% 1. Visible satellite count
assert(length(satIndices) >= 4 && length(satIndices) <= 14);

% 2. Doppler within physical limits (±10 kHz for L1, scale for other bands)
assert(all(abs(dopVisible(:)) < 10000));

% 3. Propagation delay (GPS/Galileo: 67-86 ms, NavIC: 119-130 ms)
assert(all(delayVisible(:) > 0.060 & delayVisible(:) < 0.130));

% 4. Each satellite has distinct Doppler
assert(length(unique(round(dopVisible(1,:)))) == length(satIndices));

% 5. Doppler varies over time
assert(any(abs(dopVisible(end,:) - dopVisible(1,:)) > 0.01));
```

Copyright 2026 The MathWorks, Inc.
