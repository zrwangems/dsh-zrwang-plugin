# NavIC Waveform Pipeline

NavIC-specific steps for the GNSS waveform generation workflow. This covers
Steps 1, 4, and 5. Steps 2-3 (scenario + channel params) are in SKILL.md.

**Important:** NavIC does not have a system object in R2026a. Use manual
modulation with `interplexmod`, `bocmod`, and `gnssCACode`. The
`navicWaveformGenerator` system object ships in R2026b.

## Example Setup

```matlab
openExample('satcom/NavICWaveformGenerationExample')
cd(fileparts(which('HelperNavICBBWaveform')))
```

For the E2E simulation example (additional helpers):

```matlab
openExample('shared_nav_satcom/EndtoEndNavICConstellationSimulationExample')
```

Helpers provided:

| Helper | Source Example | Purpose |
|--------|--------------|---------|
| `HelperGNSSChannel` | E2E | System object: applies Doppler, delay, AWGN per satellite |
| `HelperNavICBBWaveform` | Waveform | Baseband waveform generator (wraps manual modulation) |
| `HelperNavICConfig` | E2E | NavIC satellite configuration |
| `HelperNavICRINEX2Config` | E2E | Converts RINEX data table to NavIC nav config |
| `HelperNavICDataEncode` | Waveform | Encodes NavIC nav data bits |
| `HelperAddSatellite` | E2E | Adds NavIC satellites to scenario from RINEX data |
| `HelperGNSSConvertTime` | E2E | NavIC time conversion |

## Step 1: Configure Waveform Parameters

Since there is no system object, configure parameters manually:

```matlab
sampleRate = 24e6;
centerFrequency = 1176.45e6;  % L5 band
stepTime = 0.02;              % 20 ms per step
samplesPerStep = sampleRate * stepTime;
```

### Signal Mapping

| NavIC Signal | Frequency Band | Center Freq (MHz) | Code/Modulation |
|-------------|---------------|-------------------|-----------------|
| L5 SPS | L5 | 1176.45 | `gnssCACode("NavIC L5-SPS")` + BOC(1,1) |
| S SPS | S-band | 2492.028 | `gnssCACode("NavIC S-SPS")` + BOC(1,1) |
| L1 SPS | L1 | 1575.42 | IZ4 codes (from `.mat` file) + SBOC |

### NavIC L1 SPS

L1 uses a completely different modulation and code generation approach than L5/S:

- **Modulation:** SBOC (Synthesized BOC), not standard BOC
- **Spreading codes:** IZ4 (Interleaved Z4) linear codes, loaded from
  `NavICL1SpreadingCodeInitialConditions.mat`
- **Channel coding:** LDPC, parity matrix from
  `NavICL1LDPCParityCheckMatrixIndices.mat`
- **Data rate:** 100 bps
- **Code rate:** 1.023 Mcps
- **Frame duration:** 18 seconds

#### Required Support Files (Download Before Use)

NavIC L1 SPS requires two `.mat` support files that are NOT bundled with
the toolbox. They must be downloaded from MathWorks before generating L1
waveforms. **Without these files, L1 waveform generation will fail.**

Download and unzip using `websave`:

```matlab
% Download NavIC L1 support files (one-time setup)
if ~exist('NavICL1SpreadingCodeInitialConditions.mat','file') || ...
        ~exist('NavICL1LDPCParityCheckMatrixIndices.mat','file')
    if ~exist('L1Dataset.zip','file')
        url = 'https://ssd.mathworks.com/supportfiles/spc/satcom/NavIC/L1Dataset.zip';
        websave('L1Dataset.zip', url);
    end
    unzip('L1Dataset.zip');  % Extracts .mat files into current folder
end
```

The zip contains the two `.mat` files directly (no subdirectories). Unzipping
into the working folder makes them available via `load()`.

**Terms of Use:** The NavIC L1 PRN codes and LDPC matrices are governed by
the [NavIC ICD Terms of Use](https://ssd.mathworks.com/supportfiles/spc/satcom/NavIC/TermsOfUse.pdf).

#### L1 Configuration

```matlab
sampleRate = 24e6;
centerFrequency = 1575.42e6;  % L1 band
stepTime = 0.01;              % 10 ms per step (NOT 20 ms like L5/S)

% Load L1-specific support files (must already be on path -- see download above)
L1PRNInit = load("NavICL1SpreadingCodeInitialConditions.mat");
load("NavICL1LDPCParityCheckMatrixIndices.mat");
```

**Step time is 10 ms for L1** (1 bit per step at 100 bps), compared to
20 ms for L5/S. Nav data produces 5400 rows per satellite (vs 7200 for L5/S).

#### L1 vs L5/S: Critical Differences

| Aspect | L5/S SPS | L1 SPS |
|--------|----------|--------|
| Step time | 20 ms | 10 ms |
| Nav data rows | 7200 per satellite | 5400 per satellite |
| Spreading codes | `gnssCACode("NavIC L5-SPS", prnID)` | IZ4 from `.mat` file |
| Modulation | BOC(1,1) via `bocmod` | SBOC via `sbocmod` |
| Helper signature | `HelperNavICBBWaveform(navData, "NavIC L5-SPS", [], PRNIDs, fs)` | `HelperNavICBBWaveform(navData, "NavIC L1-SPS", L1PRNInit, PRNID, fs, bitIdx)` |
| PRN argument | Vector of all visible PRN IDs | Single PRN ID (loop per satellite) |
| Extra arguments | None | `L1PRNInit` struct + `bitIdx` (1-based step counter) |

**Key difference:** Do NOT use `gnssCACode` for L1 — it does not support
`"NavIC L1-SPS"`. Use the IZ4 codes from the `.mat` file instead.

## Step 2: Scenario Setup

NavIC uses RINEX data only (no almanac path). Read RINEX, select one
ephemeris row per satellite, then add to scenario using `HelperAddSatellite`.

**`HelperAddSatellite` expects the RINEX data table (with `SatelliteID`
field), NOT config objects.**

```matlab
rinexData = rinexread(rinexFile);
navicRinex = rinexData.NavIC;
navicRinex.Time.TimeZone = "UTC";  % Required for time comparisons

% Select one row per satellite (closest to startTime)
svIDs = unique(navicRinex.SatelliteID);
selectedRows = [];
for i = 1:numel(svIDs)
    svRows = navicRinex(navicRinex.SatelliteID == svIDs(i), :);
    [~, idx] = min(abs(svRows.Time - startTime));
    selectedRows = [selectedRows; svRows(idx,:)]; %#ok<AGROW>
end

sc = satelliteScenario;
sc.StartTime = startTime;
sc.StopTime = sc.StartTime + seconds(waveDuration - stepTime);
sc.SampleTime = stepTime;

HelperAddSatellite(sc, selectedRows);
sat = sc.Satellites;  % HelperAddSatellite modifies sc in-place, returns nothing useful
rx = groundStation(sc, lat, lon, Altitude=alt);
rx.MinElevationAngle = 10;
```

**Gotcha:** `HelperAddSatellite` adds satellites to the scenario object
in-place. It does NOT return satellite objects — use `sc.Satellites` to get
the satellite array for `dopplershift()` and `latency()` calls.

The NavIC constellation has GEO and GSO satellites, so propagation delays
are longer than GPS/Galileo MEO satellites (119-130 ms vs 67-86 ms).

Transmit power for SNR calculation: **Pt = 50 W**.

## Step 4: Encode Navigation Data

`HelperNavICRINEX2Config` takes the RINEX data table directly (not a
filename):

```matlab
navicCfg = HelperNavICRINEX2Config(selectedRows);

tempnavdata = HelperNavICDataEncode(navicCfg(1));
navdata = zeros(length(tempnavdata), length(navicCfg));
navdata(:,1) = tempnavdata;
for isat = 2:length(navicCfg)
    navdata(:,isat) = HelperNavICDataEncode(navicCfg(isat));
end
```

Nav data produces 7200 rows per satellite. Only the first `numsteps`
rows are consumed.

## Step 5: Generate Waveform

### Using HelperNavICBBWaveform (Recommended)

`HelperNavICBBWaveform` wraps the manual modulation. It returns a
multi-column matrix (one column per satellite). Pass this directly to
`HelperGNSSChannel` -- do NOT sum columns first.

```matlab
visiblePRN = selectedRows.SatelliteID(satIndices)';
numsteps = round(waveDuration / stepTime);
samplesPerStep = sampleRate * stepTime;

gnsschannelobj = HelperGNSSChannel( ...
    FrequencyOffset=dopShifts(1,satIndices), ...
    SignalDelay=ltncy(1,satIndices), ...
    SignalToNoiseRatio=snrs(1,satIndices), ...
    SampleRate=sampleRate, ...
    RandomStream="mt19937ar with seed", Seed=73);

navicWaveform = zeros(numsteps * samplesPerStep, 1);
for istep = 1:numsteps
    % Returns samplesPerStep x numSat matrix
    bbWave = HelperNavICBBWaveform( ...
        navdata(istep,satIndices), "NavIC L5-SPS", [], visiblePRN, sampleRate);

    idx = (istep-1)*samplesPerStep + (1:samplesPerStep);
    navicWaveform(idx) = gnsschannelobj(bbWave);

    if istep < numsteps
        gnsschannelobj.SignalToNoiseRatio = snrs(istep+1, satIndices);
        gnsschannelobj.FrequencyOffset = dopShifts(istep+1, satIndices);
        gnsschannelobj.SignalDelay = ltncy(istep+1, satIndices);
    end
end
```

### L1 SPS Waveform Generation (Using Helper)

L1 has a different calling convention — loop per satellite with `bitIdx`:

```matlab
% Ensure L1 support files are loaded
L1PRNInit = load("NavICL1SpreadingCodeInitialConditions.mat");

navicWaveform = zeros(numsteps * samplesPerStep, 1);
for istep = 1:numsteps
    bbWaveAll = zeros(samplesPerStep, numel(visiblePRN));
    for isat = 1:numel(visiblePRN)
        bbWaveAll(:,isat) = HelperNavICBBWaveform( ...
            navdata(istep,satIndices(isat)), "NavIC L1-SPS", ...
            L1PRNInit, visiblePRN(isat), sampleRate, istep);
    end

    idx = (istep-1)*samplesPerStep + (1:samplesPerStep);
    navicWaveform(idx) = gnsschannelobj(bbWaveAll);

    if istep < numsteps
        gnsschannelobj.SignalToNoiseRatio = snrs(istep+1, satIndices);
        gnsschannelobj.FrequencyOffset = dopShifts(istep+1, satIndices);
        gnsschannelobj.SignalDelay = ltncy(istep+1, satIndices);
    end
end
```

### Manual Modulation (Without Helper)

For L5-SPS/S-SPS, the manual pattern uses `gnssCACode`, `bocmod`, and
`interplexmod`. Note: `gnssCACode` returns `int8` -- cast to `double`
before passing to `interplexmod`.

```matlab
% Per-satellite spreading + modulation
caCode = double(gnssCACode(prnID, "NavIC L5-SPS"));  % 1023x1, int8->double
SPSBits = xor(repmat(caCode, 20, 1), navDataBit);    % 20 repetitions per bit
SPSmod = 1 - 2*double(SPSBits);

% Rate-match SPS with BOC-modulated RS signals
s2 = repelem(SPSmod, 10, 1);                % SPS
s1 = bocmod(dummyRSD, 5, 2);                % RS-Data
s3 = bocmod(dummyRSP, 5, 2);                % RS-Pilot
A = [2/3, sqrt(2)/3, sqrt(2)/3];
[compositeSig, efficiency] = interplexmod([s1, s2, s3], A);
```

## R2026b: navicWaveformGenerator

When `navicWaveformGenerator` ships in R2026b, the NavIC pipeline will
simplify to match GPS/Galileo:

```matlab
% R2026b pattern (not yet available)
wavegenobj = navicWaveformGenerator(SampleRate=sampleRate);
wavegenobj.SignalType = "L5";
wavegenobj.SVID = visibleSVIDs;
% ... same stepped loop as GPS/Galileo ...
```

Until then, use `HelperNavICBBWaveform` or manual modulation.

## Key Differences from GPS/Galileo

| Aspect | GPS/Galileo | NavIC (R2026a) |
|--------|-------------|----------------|
| System object | Yes | No (manual modulation or helper) |
| Orbit type | MEO (~20,200 km) | GEO/GSO (~35,786 km) |
| Propagation delay | 67-86 ms | 119-130 ms |
| Scenario setup | `satellite(sc, data)` | `HelperAddSatellite(sc, rinexTable)` |
| Nav data source | Almanac or RINEX | RINEX only |
| Nav config helper | `HelperGPSAlmanac2Config` / `HelperGalileoNavigationData` | `HelperNavICRINEX2Config(rinexTable)` |
| Transmit power | 44.8 W (GPS) / 160 W (Galileo) | 50 W |
| Time conversion | `HelperGPSConvertTime` (GPS) | `HelperGNSSConvertTime` |
| `gnssCACode` type | `"GPS"` | `"NavIC L5-SPS"` or `"NavIC S-SPS"` |
| Channel input | Single column (system object combines) | Multi-column (one per satellite) |

Copyright 2026 The MathWorks, Inc.
