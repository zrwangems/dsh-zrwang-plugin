# Cycling: Feature Selection for Common Applications

Load this when choosing a physically meaningful feature subset for a stated application, when interpreting a correlation-ranked feature list (see `references/cycling/postprocess.md`), or when ranking features across battery cells. Not needed to run the extraction itself.

Cycling data supports SOH, RUL, Fast Charging, and Cell Screening. After the correlation-ranked list is produced, compare the top-N against the *expected* top features below: agreement = physical grounding; a list dominated by "watch for noise" entries = too few cycles, over-smoothing, or a spurious trend.

| Application | Enable (primary → supporting) | Expected top-ranked | Watch for noise |
|-------------|-------------------------------|---------------------|-----------------|
| **SOH / Capacity** | `CycleCumulative`, `IC` → `Statistics`, `CC` (IC peaks shift/shrink as electrodes degrade — most physical) | `Discharge_CycleCumulative_capacity` (r≈−1 vs cycle), `..._IC_peak_value` (↓), `..._IC_peak_location` (drift), `Charge_CC_duration` (↑) | raw `Statistics` skewness/kurtosis correlating > 0.9 with cycle = alignment artifact, not degradation |
| **RUL / End-of-Life** | `IC`, `CycleCumulative` → `CCCV` energy ratio (CC/CV balance shifts as IR grows) | capacity slope over recent cycles, `IC` peak-height decay rate, `CCCV_EnergyRatio` shift; 2nd derivative of capacity (knee onset) > the value itself | single-cycle V/I statistics — RUL needs a *trend*, not a snapshot |
| **Fast Charging** | `CV` (CV duration ↑ = plating risk), `DT` (thermal signature) → `Statistics` (temp rise). `DT` requires `CC=true` | `Charge_CV_duration` (growing = plating), `Charge_DT_peak_value` (thermal signature), `Charge_Temperature_max`, rising `Charge_CCCV_EnergyRatio_CV` | no CV hold in the protocol → `CV` features near-zero across cycles and rank spuriously; check the protocol before trusting `CV`-dominated rankings |
| **Cell Screening** | across-cell `CycleCumulative` variance, `IC` peak-location spread | per-cell early-cycle capacity variance, `IC_peak_location` variance at cycle 1–10, `CC_duration` variance — rank *across cells at fixed cycle*, not across cycles for one cell | < 5 cells → most features look discriminative by chance; prefer physical features (capacity, IR surrogate), downweight shape statistics |

**Cross-data-type:** EIS (R0 / arc-width growth = SEI growth) complements cycling for RUL; Pulse (R0/RTotal variance) and EIS (arc width) are typically stronger for Cell Screening — see `references/eis-features.md`, `references/pulse-features.md`.

----

Copyright 2026 The MathWorks, Inc.

----
