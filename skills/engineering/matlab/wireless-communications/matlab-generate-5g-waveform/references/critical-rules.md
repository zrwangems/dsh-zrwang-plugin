# Critical Rules

These parameter constraints cause the most errors. An unedited
simplified-constructor config (`nrDLCarrierConfig(fr, bw, scs)` /
`nrULCarrierConfig(fr, bw, scs)`) already satisfies them; check the ones that
apply to anything you change, or to a no-argument (manual) build, before calling
`nrWaveformGenerator`. Apply only the fixes your layout needs, and follow
**Set Only What the Task Requires** in SKILL.md for everything else.

## NSizeGrid Must Match Channel Bandwidth

Look up `NSizeGrid` from the bandwidth tables. The simplified constructor
(R2026a+) handles this automatically. To look up values programmatically:

```matlab
nrDLCarrierConfig.FR1BandwidthTable
nrDLCarrierConfig.FR2BandwidthTable
```

## BWP Must Fit Within SCS Carrier

```
NStartBWP >= NStartGrid
NStartBWP + NSizeBWP <= NStartGrid + NSizeGrid
```

The BWP `SubcarrierSpacing` must exactly match one SCS carrier's
`SubcarrierSpacing`.

## CORESET Must Fit Within BWP

Each bit set to 1 in `FrequencyResources` allocates **6 RBs**. Total must
not exceed `NSizeBWP`:

```
6 * sum(FrequencyResources) <= NSizeBWP
```

Max bits to set: `floor(NSizeBWP / 6)`. Trailing zeros are implied, so a short
vector is enough. For narrow bandwidths:

| NSizeBWP | Max bits | Example FrequencyResources |
|----------|----------|---------------------------|
| 11       | 1        | `1` |
| 24       | 4        | `[1 1 1 1]` |
| 51       | 8        | `ones(1,8)` |

## SSB Carrier Must Be at Least 20 RBs (Except at 3 MHz)

The SCS carrier at the SSB numerology must have `NSizeGrid >= 20`, except at
`ChannelBandwidth = 3` (below). Otherwise generation errors (*"SCS carrier
associated with the SSB must be 20 resource blocks or wider"*).

**3 MHz exception: the PBCH is punctured.** At 3 MHz the 15 kHz carrier is only
15 RBs, yet the Case A SSB is accepted and generation succeeds **silently**: the
20-RB (240-subcarrier) SSB is cut to the carrier, so
PSS and SSS stay intact but about half the PBCH REs (including PBCH DM-RS) are
punctured. This is 3GPP-sanctioned (Rel-17 3 MHz channel), not a bug — keep the
SSB; do not disable it or move it to a wider carrier (the puncture affects PBCH
decoding margin and SSB power measurements). The same 15-RB carrier at any wider `ChannelBandwidth`
errors.

| BlockPattern | SSB SCS |
|-------------|---------|
| Case A      | 15 kHz  |
| Case B      | 30 kHz  |
| Case C      | 30 kHz  |
| Case D      | 120 kHz |
| Case E      | 240 kHz |

**When the user does not specify SSB parameters**, choose a BlockPattern that
matches the user's SCS carrier so no extra carrier is needed: 15 kHz → Case A,
30 kHz → Case B, 60 kHz → Case B (FR1; add a 30 kHz carrier if none exists),
120 kHz → Case D.

**When the user explicitly requests SSB parameters** that require a different
SCS than the main carrier, add a dedicated SCS carrier for the SSB:

```matlab
% Example: user wants Case A (15 kHz SSB) on a 30 kHz carrier
scsSSB = nrSCSCarrierConfig;
scsSSB.SubcarrierSpacing = 15;
scsSSB.NSizeGrid = 20;        % Minimum for SSB
cfg.SCSCarriers{end+1} = scsSSB;
cfg.SSBurst.BlockPattern = 'Case A';
```

An 11-RB data carrier (5 MHz / 30 kHz, 10 MHz / 60 kHz) cannot host the SSB
itself, but a separate 20-RB SSB carrier still fits the channel — that is what
the simplified constructor builds (see
[narrow-band-manual-config.md](narrow-band-manual-config.md)). **Disable
SSBurst** (`cfg.SSBurst.Enable = false`) only when the task wants a
single-carrier layout or no SSB.

## Point A Centering Constrains Multi-Carrier Layouts

When multiple SCS carriers coexist, Point A centers the **highest-SCS carrier**, so a
lower-SCS carrier may need fewer RBs than the bandwidth-table maximum (e.g. at 40 MHz a
full 106-RB 30 kHz carrier leaves room for only 214 RBs at 15 kHz, not the table's 216).
Call `validateConfig(cfg)` and reduce `NSizeGrid` if needed.

## CSI-RS Must Not Conflict With Other Channels

Within the same BWP, `nrWaveformGenerator` reserves CSI-RS REs automatically, so
conflicts only arise between DM-RS and CSI-RS. Across different BWPs that overlap in
frequency, CSI-RS defaults span the full BWP and can collide with PDSCH, PDCCH, or
SSBurst. Fix with `NumRB` and `RBOffset`:

```matlab
% Start from the constructor's CSI-RS: its SymbolLocations clears PDCCH
% (a new nrWavegenCSIRSConfig defaults to symbol 0, on the CORESET).
csirs1 = cfg.CSIRS{1};       % BWP 1 (BandwidthPartID default 1 — don't restate it)
csirs1.Enable = true;        % the constructor ships CSI-RS disabled
csirs1.NumRB = 106;          % confine to PDSCH1's region (RBOffset default 0 — don't restate it)

csirs2 = csirs1;
csirs2.BandwidthPartID = 2;  % set only where it differs from the default 1
csirs2.NumRB = 53;
csirs2.RBOffset = 53;        % non-default offset — genuinely needed to clear PDSCH1

cfg.CSIRS = {csirs1, csirs2};
```

The CSI-RS/SSBurst clash is **wider than it looks**: across different SCS (SSBurst
Case A 15 kHz vs CSI-RS on a 30 kHz BWP) one SSB symbol maps to several on the CSI-RS
grid, so a small SSB footprint forbids a broad band and a mid-slot guess (e.g. 8) lands
inside it. Check every CSI-RS on any BWP; resolve in order, then **re-run
`nrWaveformGenerator` to confirm clean**: (1) **`CSIRSPeriod`** *(most robust)* — steer
CSI-RS to a slot the SSBurst skips (`CSIRSPeriod = [10 1]`), any numerology; (2)
**`NumRB`/`RBOffset`** — a region clear of the SSBurst carrier; (3) **`SymbolLocations`**
*(last resort)* — place at the slot **end** (`13`/`12`), never mid-slot. Keep CSI-RS
off the CORESET symbols (0–1 by default) so the same placement also clears PDCCH — no
need to touch the unrequested PDCCH. A new `nrWavegenCSIRSConfig` defaults to
`SymbolLocations = 0`, which lands on the CORESET and conflicts with PDCCH. The
simplified constructor's (disabled) `CSIRS{1}` instead holds a layout-specific symbol
(3, 4, or 6) that clears both PDCCH and SSBurst, so just enabling it generates cleanly.
Resizing it (`NumRB`/`RBOffset`) can reopen the SSBurst clash, so re-run.

## PDCCH Conflicts With PDSCH Across BWPs or RNTIs

Within the same BWP and RNTI, `nrWaveformGenerator` automatically reserves
REs for PDCCH (via the CORESET region). PDCCH conflicts with PDSCH when:

- They are on **different overlapping BWPs**
- They have **different RNTIs** on the same BWP

To resolve, separate them in time (`SymbolAllocation`, `SlotAllocation`) or
frequency (`PRBSet`).

## PDSCH/PUSCH PRBSet Must Fit Within BWP

Every RB in `PRBSet` must lie inside the BWP:

```
max(PRBSet) < NSizeBWP
```

**Always set `PRBSet` explicitly to fit the BWP** — `PRBSet = 0:NSizeBWP-1` for
full-band. An over-range `PRBSet` is invalid, and the reaction is
release-dependent (through R2026a it errors; R2026b silently clips), so rely on
neither. The default `0:51` overflows any BWP under 52 RBs (e.g. an 11-RB 5 MHz /
30 kHz carrier). `PRBSet` sets frequency allocation only — waveform length is
fixed by bandwidth, SCS, and `NumSubframes`.

## Two Codewords Need 5–8 Layers and a Matching DM-RS

A PDSCH or PUSCH carries 2 codewords only when `NumLayers` is 5–8 (TS 38.211
Table 7.3.1.3-1; 8-layer PUSCH is Rel-18 UL MIMO). The default DM-RS (type 1,
single-symbol) supports only 4 ports, so `NumLayers > 4` errors unless the DM-RS
is also changed:

| `DMRSConfigurationType` | `DMRSLength` | Max layers |
|---|---|---|
| 1 (default) | 1 (default) | 4 |
| 1 | 2 | 8 |
| 2 | 1 | 6 |
| 2 | 2 | 8 (max) |

```matlab
cfg.PDSCH{1}.NumLayers = 8;          % 2 codewords need 5–8 layers
cfg.PDSCH{1}.DMRS.DMRSLength = 2;    % default DM-RS caps at 4 ports
```

The same two lines apply to `cfg.PUSCH{1}` in an `nrULCarrierConfig`. A 2-codeword
PUSCH also needs `TransformPrecoding = false` (the default); transform precoding
supports only one codeword.

The DM-RS change is task-required, not over-config. `nrWaveformGenerator`
sizes the antenna count to `NumLayers` automatically.

## PDCCH Links Through SearchSpace to CORESET

`PDCCH.SearchSpaceID` must reference a valid `SearchSpace`, which must
reference a valid `CORESET` via `CORESETID`. All IDs must exist.

Copyright 2026 The MathWorks, Inc.
