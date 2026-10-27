# Galileo Waveform Pipeline

Galileo-specific steps for the GNSS waveform generation workflow. This covers
Steps 1, 4, and 5. Steps 2-3 (scenario + channel params) are in SKILL.md.

## Example Setup

```matlab
openExample('satcom/GalileoWaveformGenerationExample')
cd(fileparts(which('HelperGalileoNavigationData')))
```

For the E2E positioning example (additional helpers):

```matlab
openExample('shared_nav_satcom/GalileoGNSSReceiverPositioningExample')
```

Helpers provided:

| Helper | Purpose |
|--------|---------|
| `HelperGNSSChannel` | System object: applies Doppler, delay, AWGN per satellite |
| `HelperAddGalileoSatellitesToScenario` | Adds Galileo satellites to scenario from XML almanac |
| `HelperGalileoNavigationData` | Reads RINEX, encodes Galileo nav bits |
| `HelperGNSSConvertTime` | Galileo time conversion |
| `galileoAlmanac.xml` | Galileo almanac file (XML format) |

**Do NOT use `HelperGalileoWaveformGenerator`.** Use the system object
`galileoWaveformGenerator` instead -- it is a shipped feature.

## Step 1: Configure Waveform Generator

```matlab
sampleRate = 25e6;
wavegenobj = galileoWaveformGenerator(SampleRate=sampleRate);
```

### Signal Type Mapping

| Galileo Signal | `SignalType` | Center Freq (MHz) | `BitDuration` (ms) |
|---------------|-------------|-------------------|-------------------|
| E1 | `"E1"` | 1575.42 | 4 |
| E1C (pilot) | `"E1C"` | 1575.42 | 4 |
| E5a | `"E5a"` | 1176.45 | 20 |
| E5b | `"E5b"` | 1207.14 | 4 |
| E5 (wideband) | `"E5"` | 1191.795 | 20 |

```matlab
wavegenobj.SignalType = "E1";
centerFrequency = 1575.42e6;
stepTime = wavegenobj.BitDuration;
```

## Step 2: Scenario Setup

Choose almanac or RINEX. The same source must also feed Step 4 (nav data).

**Almanac path** -- `satellite()` does NOT accept Galileo XML almanac files.
Use `HelperAddGalileoSatellitesToScenario` instead. This helper reads the
XML with `readstruct()`, computes ECEF positions via
`matlabshared.internal.gnss.orbitParametersToECEF()`, and adds satellites
via position timetables:

```matlab
almFileName = "galileoAlmanac.xml";
startTime = datetime("now", TimeZone="UTC");  % Must be near the almanac epoch (see Gotcha #12)

sc = satelliteScenario;
sc.StartTime  = startTime;
sc.StopTime   = sc.StartTime + seconds(waveDuration - stepTime);
sc.SampleTime = stepTime;

% Must set scenario timing BEFORE calling the helper
sat = HelperAddGalileoSatellitesToScenario(sc, almFileName);
rx = groundStation(sc, lat, lon, Altitude=alt);
rx.MinElevationAngle = 10;
```

**RINEX path** -- `satellite()` accepts RINEX data natively for Galileo:

```matlab
rinexdata = rinexread(rinexFileName);
almFileName = "galileoAlmanac.xml";  % Still needed for nav data

sc = satelliteScenario;
sc.StartTime  = startTime;
sc.StopTime   = sc.StartTime + seconds(waveDuration - stepTime);
sc.SampleTime = stepTime;

sat = satellite(sc, rinexdata);
rx = groundStation(sc, lat, lon, Altitude=alt);
rx.MinElevationAngle = 10;
```

Transmit power for SNR calculation: **Pt = 160 W** (not 44.8 W like GPS).

## Step 4: Encode Navigation Data

Galileo uses `HelperGalileoNavigationData` for nav data encoding.
The almanac file supplements nav data via `setnavdata`.
**Must match the data source used in Step 2.**

### Signal Type Mapping for Nav Data

`HelperGalileoNavigationData` uses different signal type names than
`galileoWaveformGenerator`:

| Waveform `SignalType` | Nav data `SignalType` | Notes |
|----------------------|----------------------|-------|
| `"E1"` | `"E1B"` | |
| `"E1C"` | — (pilot, no nav data) | Pass empty bits or zeros |
| `"E5a"` | `"E5a"` | F/NAV, 50 sps |
| `"E5b"` | `"E5b"` | I/NAV, 250 sps |
| `"E5"` | Both `"E5a"` + `"E5b"` | See E5 section below |

### Getting Visible SVIDs

SVIDs come from the nav data object, not from `orbitalElements` (which
lacks PRN for Galileo satellites added via position timetables):

```matlab
visibleSVIDs = galNavObj.Ephemeris.SatelliteID(satIndices);
```

### Time Conversion

Galileo nav data encoding needs the time-of-week (TOW) counter:

```matlab
[~, inittow] = HelperGPSConvertTime(startTime);
```

### Almanac Path (matches almanac scenario)

Pass almanac filename as first arg with `true` to load ephemeris from it:

```matlab
galNavObj = HelperGalileoNavigationData(almFileName, true, SignalType="E1B");
visibleSVIDs = galNavObj.Ephemeris.SatelliteID(satIndices);
[~, inittow] = HelperGPSConvertTime(startTime);
numNavDataBits = round(waveDuration / stepTime);
numpages = ceil(5*numNavDataBits/250);  % I/NAV pages; safe for all signals (overestimates for F/NAV)
navdata = navdata2bits(galNavObj, visibleSVIDs, inittow, numpages);
navdata = navdata(1:numNavDataBits,:);
```

### RINEX Path (matches RINEX scenario)

Pass RINEX struct as first arg; almanac supplements via `setnavdata`:

```matlab
galNavObj = HelperGalileoNavigationData(rinexdata, SignalType="E1B");
setnavdata(galNavObj, almFileName, false);
visibleSVIDs = galNavObj.Ephemeris.SatelliteID(satIndices);
[~, inittow] = HelperGPSConvertTime(startTime);
numNavDataBits = round(waveDuration / stepTime);
numpages = ceil(5*numNavDataBits/250);
navdata = navdata2bits(galNavObj, visibleSVIDs, inittow, numpages);
navdata = navdata(1:numNavDataBits,:);
```

### RINEX Filtering for Galileo

When using RINEX data for Galileo, filter by `DataSources` bitmask to get
consistent ephemeris and select a single `IODnav` per satellite:

```matlab
rinexData = rinexread(rinexFile);
galData = rinexData.Galileo;

% Filter for I/NAV data sources (bitmask check)
isINAV = bitand(galData.DataSources, 2) > 0;
galINAV = galData(isINAV, :);

% Select consistent IODnav per satellite
svIDs = unique(galINAV.SatelliteID);
for i = 1:numel(svIDs)
    svRows = galINAV(galINAV.SatelliteID == svIDs(i), :);
    % Use the most recent IODnav before startTime
    validRows = svRows(svRows.Time <= startTime, :);
    if ~isempty(validRows)
        [~, latestIdx] = max(validRows.Time);
        selectedEph(i) = validRows(latestIdx, :); %#ok<AGROW>
    end
end
```

## Step 5: Generate Waveform

Galileo uses `SVID` (not `PRNID` like GPS):

```matlab
wavegenobj.SVID = visibleSVIDs;

gnsschannelobj = HelperGNSSChannel( ...
    FrequencyOffset=dopShifts(1,satIndices), ...
    SignalDelay=ltncy(1,satIndices), ...
    SignalToNoiseRatio=snrs(1,satIndices), ...
    SampleRate=sampleRate, ...
    RandomStream="mt19937ar with seed", Seed=73);

numsteps = round(waveDuration / stepTime);
samplesPerStep = sampleRate * stepTime;
galWaveform = zeros(numsteps * samplesPerStep, 1);

for istep = 1:numsteps
    idx = (istep-1)*samplesPerStep + (1:samplesPerStep);
    galWaveform(idx,:) = gnsschannelobj(wavegenobj(navdata(istep,:)));
    gnsschannelobj.SignalToNoiseRatio = snrs(istep, satIndices);
    gnsschannelobj.FrequencyOffset = dopShifts(istep, satIndices);
    gnsschannelobj.SignalDelay = ltncy(istep, satIndices);
end
```

## E5 Wideband Signal (AltBOC)

E5 is a composite of E5a and E5b using AltBOC modulation. It has several
pitfalls that differ from other Galileo signals:

### Pitfall 1: Nav data must be a cell array, not a matrix

Unlike all other signal types where `navdata(istep,:)` is a row vector,
E5 requires a **two-element cell array** `{fnavbits, inavbits}`:

```matlab
% WRONG — this will error for E5:
wavegenobj(navdata(istep,:));

% CORRECT for E5:
wavegenobj({fnavbits(istep,:), inavbits(istep,:)});
```

### Pitfall 2: I/NAV has 5× more rows than F/NAV

F/NAV (E5a component) runs at 50 sps. I/NAV (E5b component) runs at 250 sps.
So for `numNavDataBits` steps of the waveform, you need:
- `fnavbits`: `numNavDataBits` rows
- `inavbits`: `5 * numNavDataBits` rows

### Pitfall 3: Center frequency is 1191.795 MHz

Not E5a (1176.45) and not E5b (1207.14). E5 uses the midpoint:
`centerFrequency = 1191.795e6;`

### Pitfall 4: Higher sample rate needed

E5 spans ~51 MHz bandwidth (AltBOC). Use at least 60 MHz sample rate:
```matlab
sampleRate = 60e6;  % Minimum for E5 wideband
```

### Complete E5 Nav Data Encoding

```matlab
% Generate F/NAV (E5a component) and I/NAV (E5b component) separately
galNavObjFNAV = HelperGalileoNavigationData(almFileName, true, SignalType="E5a");
galNavObjINAV = HelperGalileoNavigationData(almFileName, true, SignalType="E5b");

visibleSVIDs = galNavObjFNAV.Ephemeris.SatelliteID(satIndices);
[~, inittow] = HelperGPSConvertTime(startTime);
numNavDataBits = round(waveDuration / stepTime);

% F/NAV: 50 sps → numNavDataBits rows
numpagesFNAV = ceil(5*numNavDataBits/500);
fnavbits = navdata2bits(galNavObjFNAV, visibleSVIDs, inittow, numpagesFNAV);
fnavbits = fnavbits(1:numNavDataBits,:);

% I/NAV: 250 sps → 5*numNavDataBits rows
numpagesINAV = ceil(5*(5*numNavDataBits)/250);
inavbits = navdata2bits(galNavObjINAV, visibleSVIDs, inittow, numpagesINAV);
inavbits = inavbits(1:5*numNavDataBits,:);
```

### Complete E5 Waveform Loop

```matlab
wavegenobj.SignalType = "E5";
wavegenobj.SVID = visibleSVIDs;
centerFrequency = 1191.795e6;
sampleRate = 60e6;

for istep = 1:numsteps
    idx = (istep-1)*samplesPerStep + (1:samplesPerStep);
    inavIdx = (istep-1)*5 + (1:5);  % 5 I/NAV bits per step
    navbits = {fnavbits(istep,:), inavbits(inavIdx,:)};
    galWaveform(idx,:) = gnsschannelobj(wavegenobj(navbits));
    gnsschannelobj.SignalToNoiseRatio = snrs(istep, satIndices);
    gnsschannelobj.FrequencyOffset = dopShifts(istep, satIndices);
    gnsschannelobj.SignalDelay = ltncy(istep, satIndices);
end
```

## E1C Pilot Signal

E1C is the pilot (dataless) component of E1. It carries no navigation data,
only a spreading code. Use when testing acquisition/tracking without nav
data decoding.

```matlab
wavegenobj.SignalType = "E1C";
centerFrequency = 1575.42e6;
% Pass zeros or empty for nav bits — E1C has no data component
navbits = zeros(numsteps, length(visibleSVIDs));
```

## Key Differences from GPS

| Aspect | GPS | Galileo |
|--------|-----|---------|
| System object | `gpsWaveformGenerator` | `galileoWaveformGenerator` |
| Satellite ID property | `PRNID` | `SVID` |
| Almanac format | SEM text (`.txt`) | XML (`.xml`) |
| Scenario satellite setup | `satellite(sc, almFile)` (native) | `HelperAddGalileoSatellitesToScenario(sc, almFile)` (helper required) |
| Transmit power | 44.8 W | 160 W |
| Nav data helper | `HelperGPSNAVDataEncode` | `HelperGalileoNavigationData.navdata2bits` |
| Nav data source | Almanac or RINEX (via `HelperGPSRINEX2Config`) | Almanac or RINEX (via constructor arg) |
| RINEX scenario support | `satellite(sc, rinexdata)` (native) | `satellite(sc, rinexdata)` (native) |
| Time conversion | `HelperGPSConvertTime` | `HelperGNSSConvertTime` |

Copyright 2026 The MathWorks, Inc.
