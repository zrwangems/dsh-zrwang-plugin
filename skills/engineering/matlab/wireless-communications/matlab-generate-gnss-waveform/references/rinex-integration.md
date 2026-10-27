# RINEX Integration for GNSS Waveform Generation

Use RINEX navigation files as an alternative to almanac files for satellite
orbit propagation. Requires Navigation Toolbox.

The almanac workflow is the default -- it works on all installations with
Satellite Communications Toolbox. RINEX integration is optional.

## Pipeline Overview

```
rinexread() --struct--> satellite(sc, struct, OrbitPropagator="gps")
                           |
                           v
              Scenario provides Doppler, delay, SNR
```

## GPS RINEX

```matlab
rinexData = rinexread("GODS00USA_R_20211750000_01D_GN.rnx");
gpsNavData = rinexData.GPS;  % Table with Time, SatelliteID, etc.

sc = satelliteScenario;
sat = satellite(sc, rinexData, OrbitPropagator="gps");
```

**Pass the struct returned by `rinexread`, not the filename.** Passing the
`.rnx` filename makes `satellite()` treat it as a TLE file and fail.

Navigation data encoding still requires an almanac file --
`HelperGPSAlmanac2Config` does not accept RINEX data.

## Galileo RINEX

Galileo RINEX data requires filtering by `DataSources` bitmask and selecting
a consistent `IODnav` per satellite:

```matlab
rinexData = rinexread(rinexFile);
galData = rinexData.Galileo;

% Filter for I/NAV data sources (bit 1 set)
isINAV = bitand(galData.DataSources, 2) > 0;
galINAV = galData(isINAV, :);

% Select the most recent ephemeris before startTime per satellite
svIDs = unique(galINAV.SatelliteID);
for i = 1:numel(svIDs)
    svRows = galINAV(galINAV.SatelliteID == svIDs(i), :);
    validRows = svRows(svRows.Time <= startTime, :);
    if ~isempty(validRows)
        [~, latestIdx] = max(validRows.Time);
        selectedEph(i) = validRows(latestIdx, :); %#ok<AGROW>
    end
end
```

Galileo nav data encoding uses `HelperGalileoNavigationData(rinexFile)` which
reads the RINEX file directly -- unlike GPS which needs a separate almanac.

## NavIC RINEX

NavIC uses RINEX for both orbit propagation and nav data encoding via
`HelperNavICRINEX2Config`:

```matlab
navicData = HelperNavICRINEX2Config(rinexFile, satIndices, startTime);
```

NavIC satellites are added to the scenario using `HelperAddSatellite` instead
of the standard `satellite()` function:

```matlab
HelperAddSatellite(sc, navicData);
```

## Available RINEX Files (Bundled with Navigation Toolbox)

These RINEX files ship with the Navigation Toolbox in:
`toolbox/nav/positioning/core/positioningdata/`

They are on the MATLAB path by default when the Navigation Toolbox is installed.

| File | Constellation | Satellites | Epoch |
|------|--------------|-----------|-------|
| `GODS00USA_R_20211750000_01D_GN.rnx` | GPS | 31 | 24-Jun-2021 |
| `GODS00USA_R_20211750000_01D_EN.rnx` | Galileo | 24 | 24-Jun-2021 |
| `GODS00USA_R_20211750000_01D_CN.rnx` | BeiDou | 28 | 24-Jun-2021 |
| `GODS00USA_R_20211750000_01D_RN.rnx` | GLONASS | 24 | 24-Jun-2021 |
| `ARHT00ATA_R_20211750000_01D_IN.rnx` | NavIC | 4 | 24-Jun-2021 |
| `ARHT00ATA_R_20211750000_01D_JN.rnx` | QZSS | 4 | 24-Jun-2021 |
| `GOP600CZE_R_20211750000_01D_SN.rnx` | SBAS | 8 | 24-Jun-2021 |
| `GODS00USA_R_20211750000_01H_30S_MO.rnx` | Mixed Obs (GPS/GLO/GAL/BDS) | — | 24-Jun-2021 |

All navigation files share the same epoch (24-Jun-2021), so a single
`startTime` works across constellations for multi-system simulations.

**RINEX filename convention:** `SSSS00CCC_R_YYYYDDD_DUR_TYPE.rnx`
- Last two characters before `.rnx`: `GN`=GPS, `EN`=Galileo, `CN`=BeiDou,
  `RN`=GLONASS, `IN`=NavIC, `JN`=QZSS, `SN`=SBAS, `MN`=Mixed Nav, `MO`=Mixed Obs

## Choosing Start Time

The scenario start time must fall within the RINEX data time range:

```matlab
gpsData = rinexData.GPS;
timeRange = [min(gpsData.Time), max(gpsData.Time)];
startTime = datetime(2021,6,24,6,0,0, TimeZone="UTC");
assert(startTime >= timeRange(1) && startTime <= timeRange(2));
```

## When Navigation Toolbox Is Not Available

Fall back to the almanac workflow. Check and branch:

```matlab
hasNavToolbox = ~isempty(ver('nav'));
if hasNavToolbox && exist(rinexFile, 'file')
    rinexData = rinexread(rinexFile);
    sat = satellite(sc, rinexData, OrbitPropagator="gps");
else
    sat = satellite(sc, almFileName, OrbitPropagator="gps");
end
```

## Testing Without Navigation Toolbox

Temporarily remove the Navigation Toolbox from the MATLAB path to verify
the fallback path works:

```matlab
function cleanupObj = hideNavToolbox()
%hideNavToolbox Temporarily remove Navigation Toolbox from the MATLAB path.
%   Returns a cleanup object that restores the path when it goes out of scope.

    navPath = toolboxdir('nav');
    pathEntries = strsplit(path, pathsep);
    navEntries = pathEntries(contains(pathEntries, navPath));

    originalPath = path;
    cleanupObj = onCleanup(@() path(originalPath));

    for i = 1:numel(navEntries)
        rmpath(navEntries{i});
    end

    assert(isempty(ver('nav')), 'Navigation Toolbox should be hidden');
end
```

Usage in a test:

```matlab
cleanup = hideNavToolbox();

assert(isempty(ver('nav')));
assert(exist('rinexread', 'file') == 0);

% Your code should take the almanac fallback path
hasNavToolbox = ~isempty(ver('nav'));  % false

% Path restored when cleanup goes out of scope
delete(cleanup);
assert(~isempty(ver('nav')));
```

The `onCleanup` object guarantees the path is restored even if an error
occurs.

Copyright 2026 The MathWorks, Inc.
