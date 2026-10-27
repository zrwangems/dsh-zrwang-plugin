# DAQmx_Val_* Enum Constants

The 15 most-used enum name strings for calldaqlib, organized by category.

## Trigger edges and slopes

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_Rising"` | `DAQmxCfgDigEdgeStartTrig` edge, `DAQmxCfgDigEdgeRefTrig` edge |
| `"DAQmx_Val_Falling"` | Same — falling edge variant |
| `"DAQmx_Val_RisingSlope"` | `DAQmxCfgAnlgEdgeStartTrig` slope, `DAQmxCfgAnlgEdgeRefTrig` slope |
| `"DAQmx_Val_FallingSlope"` | Same — falling slope variant |

**Trap:** `"DAQmx_Val_Rising"` and `"DAQmx_Val_RisingSlope"` both map to
int32 10280 but are NOT interchangeable. Digital trigger functions accept
`Rising`/`Falling`; analog trigger functions accept `RisingSlope`/`FallingSlope`.
Using the wrong one produces "Value must be of type int32" — meaning the string
was not recognized for that slot.

## Sample modes

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_ContSamps"` | `DAQmxCfgSampClkTiming` sampleMode — continuous acquisition |
| `"DAQmx_Val_FiniteSamps"` | Same — finite number of samples |
| `"DAQmx_Val_HWTimedSinglePoint"` | Same — hardware-timed single point (HWTSP) |

## Signal export IDs

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_StartTrigger"` | `DAQmxExportSignal` signalID |
| `"DAQmx_Val_ReferenceTrigger"` | Same |
| `"DAQmx_Val_SampleClock"` | Same |

## Terminal routing

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_DoNotInvertPolarity"` | `DAQmxConnectTerms` signalModifiers |
| `"DAQmx_Val_InvertPolarity"` | Same |

## Delay units

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_Seconds"` | `DAQmxSetStartTrigDelayUnits` |
| `"DAQmx_Val_Ticks"` | Same |

## Trigger type (none)

| MATLAB string | Use in |
|---|---|
| `"DAQmx_Val_None"` | `DAQmxSetStartTrigType` — disable trigger |

## Usage rule

Always pass the **string form** to calldaqlib. Both strings and `int32(N)`
work at the driver level, but strings are self-documenting and prevent
wrong-enum-family bugs. If unsure which enum a slot accepts, check the NI
C Reference documentation for that function.

----

Copyright 2026 The MathWorks, Inc.

----
