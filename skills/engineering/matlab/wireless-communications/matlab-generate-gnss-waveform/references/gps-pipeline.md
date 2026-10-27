# GPS Waveform Pipeline

GPS-specific steps for the GNSS waveform generation workflow. This covers
Steps 1, 4, and 5. Steps 2-3 (scenario + channel params) are in SKILL.md.

## Example Setup

```matlab
openExample('satcom/GNSSSignalTransmissionUsingSDRExample')
cd(fileparts(which('HelperGNSSChannel')))
```

For the RINEX workflow (E2E positioning), also open:

```matlab
openExample('shared_nav_satcom/EndtoEndGPSLNAVReceiverExample')
```

Helpers provided (across both examples):

| Helper | Source Example | Purpose |
|--------|--------------|---------|
| `HelperGNSSChannel` | SDR | System object: applies Doppler, delay, AWGN per satellite |
| `HelperGPSAlmanac2Config` | SDR | Converts SEM almanac to nav config objects |
| `HelperGPSNAVDataEncode` | SDR / E2E | Encodes nav data bits with real ephemeris |
| `HelperGPSNavigationConfig` | E2E | Navigation configuration object |
| `HelperGPSRINEX2Config` | E2E | Maps RINEX data to nav config (RINEX path) |
| `HelperGPSConvertTime` | SDR / E2E | GPS week/TOW to datetime conversion |
| `gpsAlmanac.txt` | SDR / E2E | SEM almanac file (bundled with example) |

## Step 1: Configure Waveform Generator

```matlab
sampleRate = 5e6;
wavegenobj = gpsWaveformGenerator(SampleRate=sampleRate);
```

### Signal Type Mapping

| GPS Signal | `SignalType` | `navDataType` | Center Freq (MHz) | `BitDuration` (ms) |
|------------|-------------|---------------|-------------------|-------------------|
| L1 C/A | `"legacy"` | `"LNAV"` | 1575.42 | 20 |
| L1C | `"l1C"` | `"CNAV2"` | 1575.42 | 10 |
| L2C | `"l2c"` | `"CNAV"` | 1227.60 | 20 |
| L5 | `"l5"` | `"L5"` | 1176.45 | 10 |

```matlab
wavegenobj.SignalType = "legacy";  % For GPS L1 C/A
navDataType = "LNAV";
centerFrequency = 1575.42e6;
stepTime = wavegenobj.BitDuration;
```

## Step 2: Scenario Setup

**Almanac path** -- GPS uses the SEM almanac file with `OrbitPropagator="gps"`:

```matlab
almFileName = "gpsAlmanac.txt";
startTime = datetime(2021,6,24,0,0,48, TimeZone="UTC");

sc = satelliteScenario;
sat = satellite(sc, almFileName, OrbitPropagator="gps");
```

**RINEX path** -- pass the struct from `rinexread`, not the filename:

```matlab
rinexFileName = "GODS00USA_R_20211750000_01D_GN.rnx";
almFileName = "gpsAlmanac.txt";  % Still needed for nav data encoding

rinexdata = rinexread(rinexFileName);
sc = satelliteScenario;
sat = satellite(sc, rinexdata, OrbitPropagator="gps");
```

**Choose one path and use the same source for Step 4 (nav data).**

Transmit power for SNR calculation: **Pt = 44.8 W**.

## Step 4: Encode Navigation Data

**Almanac path** (matches almanac scenario from Step 2):

```matlab
navcfg = HelperGPSAlmanac2Config(almFileName, navDataType, satIndices, startTime);
visiblesatPRN = [navcfg(:).PRNID];

tempnavdata = HelperGPSNAVDataEncode(navcfg(1));
navdata = zeros(length(tempnavdata), length(navcfg));
navdata(:,1) = tempnavdata;
for isat = 2:length(navcfg)
    navdata(:,isat) = HelperGPSNAVDataEncode(navcfg(isat));
end
```

**RINEX path** (matches RINEX scenario from Step 2). Uses
`HelperGPSRINEX2Config` from the GPS E2E example. This helper maps RINEX
ephemeris fields to the nav config object. The almanac file is still
required -- it provides supplementary fields (e.g., health, almanac pages):

```matlab
% Match RINEX rows to scenario satellites by Toe and SatelliteID
indices = ones(length(sat), 1);
for isat = 1:length(sat)
    ele = orbitalElements(sat(isat));
    indices(isat) = find(rinexdata.GPS.Toe == ele.GPSTimeOfApplicability & ...
        rinexdata.GPS.SatelliteID == ele.PRN);
end

navcfg = HelperGPSRINEX2Config(almFileName, rinexdata.GPS(indices,:));
visiblesatPRN = [navcfg(:).PRNID];

% Encode nav data (same as almanac path from here)
navdata = zeros(37500, length(navcfg));
for isat = 1:length(navcfg)
    navdata(:,isat) = HelperGPSNAVDataEncode(navcfg(isat));
end
```

### Nav Data Sizes

| `navDataType` | Rows per satellite | Structure |
|---------------|-------------------|-----------|
| `"LNAV"` | 37500 | 25 frames x 5 subframes x 300 bits |
| `"CNAV2"` | 88200 | Larger message structure |
| `"CNAV"` | 18000 | Compact nav message |
| `"L5"` | 18000 | Same structure as CNAV |

Only the first `numsteps = round(waveDuration / stepTime)` rows are consumed.
The encoder always produces the full message -- this is correct.

## Step 5: Generate Waveform

```matlab
wavegenobj.PRNID = visiblesatPRN;

gnsschannelobj = HelperGNSSChannel( ...
    FrequencyOffset=dopShifts(1,satIndices), ...
    SignalDelay=ltncy(1,satIndices), ...
    SignalToNoiseRatio=snrs(1,satIndices), ...
    SampleRate=sampleRate, ...
    RandomStream="mt19937ar with seed", Seed=73);

numsteps = round(waveDuration / stepTime);
samplesPerStep = sampleRate * stepTime;
gpswaveform = zeros(numsteps * samplesPerStep, 1);

for istep = 1:numsteps
    idx = (istep-1)*samplesPerStep + (1:samplesPerStep);
    gpswaveform(idx,:) = gnsschannelobj(wavegenobj(navdata(istep,:)));
    gnsschannelobj.SignalToNoiseRatio = snrs(istep, satIndices);
    gnsschannelobj.FrequencyOffset = dopShifts(istep, satIndices);
    gnsschannelobj.SignalDelay = ltncy(istep, satIndices);
end
```

## GPS Time Conversion

Use `HelperGPSConvertTime` (not `HelperGNSSConvertTime`) for GPS:

```matlab
[gpsWeek, gpsTOW] = HelperGPSConvertTime(startTime);
```

Copyright 2026 The MathWorks, Inc.
