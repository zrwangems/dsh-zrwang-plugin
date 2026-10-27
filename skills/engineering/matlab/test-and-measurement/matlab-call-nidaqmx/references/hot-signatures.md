# Hot Signatures (20 most-used calldaqlib calls)

Verified on R2026a Update 1. Use these directly — no need to grep NIDAQmx.h.

## Timing

| Function | calldaqlib form |
|---|---|
| `DAQmxCfgSampClkTiming` | `calldaqlib(dq, "DAQmxCfgSampClkTiming", source, rate, activeEdge, sampleMode, sampsPerChan)` |
| `DAQmxGetSampClkRate` | `r = calldaqlib(dq, "DAQmxGetSampClkRate")` → dictionary |
| `DAQmxSetSampClkRate` | `calldaqlib(dq, "DAQmxSetSampClkRate", rate)` |
| `DAQmxGetSampClkSrc` | `calldaqlib(dq, "DAQmxGetSampClkSrc", "", 256)` → dictionary |
| `DAQmxSetSampClkSrc` | `calldaqlib(dq, "DAQmxSetSampClkSrc", "/Dev1/PFI0")` |
| `DAQmxGetSampClkTimebaseSrc` | `calldaqlib(dq, "DAQmxGetSampClkTimebaseSrc", "", 1024)` → dictionary |
| `DAQmxSetSampClkTimebaseSrc` | `calldaqlib(dq, "DAQmxSetSampClkTimebaseSrc", "/cDAQ1Mod2/SampleClockTimebase")` |

## Triggers

| Function | calldaqlib form |
|---|---|
| `DAQmxCfgAnlgEdgeStartTrig` | `calldaqlib(dq, "DAQmxCfgAnlgEdgeStartTrig", "Dev1/ai0", "DAQmx_Val_RisingSlope", 4.0)` |
| `DAQmxCfgDigEdgeStartTrig` | `calldaqlib(dq, "DAQmxCfgDigEdgeStartTrig", "/Dev1/PFI0", "DAQmx_Val_Rising")` |
| `DAQmxCfgAnlgEdgeRefTrig` | `calldaqlib(dq, "DAQmxCfgAnlgEdgeRefTrig", "Dev1/ai0", "DAQmx_Val_RisingSlope", 4.0, 1000)` |
| `DAQmxCfgDigEdgeRefTrig` | `calldaqlib(dq, "DAQmxCfgDigEdgeRefTrig", "/Dev1/PFI0", "DAQmx_Val_Rising", 1000)` |
| `DAQmxSetAnlgEdgeStartTrigHyst` | `calldaqlib(dq, "DAQmxSetAnlgEdgeStartTrigHyst", 0.1)` |
| `DAQmxSetStartTrigRetriggerable` | `calldaqlib(dq, "DAQmxSetStartTrigRetriggerable", true)` |
| `DAQmxSetStartTrigDelay` | `calldaqlib(dq, "DAQmxSetStartTrigDelay", 1e-3)` |
| `DAQmxSetStartTrigDelayUnits` | `calldaqlib(dq, "DAQmxSetStartTrigDelayUnits", "DAQmx_Val_Seconds")` |

## Signal export

| Function | calldaqlib form |
|---|---|
| `DAQmxExportSignal` | `calldaqlib(dq, "DAQmxExportSignal", "DAQmx_Val_StartTrigger", "/Dev1/PFI1")` |

Common signalIDs: `StartTrigger`, `ReferenceTrigger`, `SampleClock`,
`AdvanceTrigger`, `AIHoldCmpltEvent`, `CounterOutputEvent`,
`ChangeDetectionEvent`, `10MHzRefClock`, `20MHzTimebaseClock`.

## Channel / task introspection

| Function | calldaqlib form |
|---|---|
| `DAQmxGetTaskChannels` | `calldaqlib(dq, "DAQmxGetTaskChannels", "", 1024)` → dictionary |
| `DAQmxGetChanType` | `calldaqlib(dq, "DAQmxGetChanType", "Dev1/ai0")` → dictionary (int32 enum) |

## AI signal conditioning

| Function | calldaqlib form |
|---|---|
| `DAQmxSetAIEnhancedAliasRejectionEnable` | `calldaqlib(dq, "DAQmxSetAIEnhancedAliasRejectionEnable", "Dev1/ai0", true)` (DSA devices only: NI-4461, 4462, 4480) |

## Digital filtering

| Function | calldaqlib form |
|---|---|
| `DAQmxSetDIDigFltrMinPulseWidth` | `calldaqlib(dq, "DAQmxSetDIDigFltrMinPulseWidth", "Dev1/port0/line0", 1e-6)` |

## Buffer-size guidance

| Getter type | bufferSize |
|---|---|
| Numeric (float64/int32/bool32 output) | Not needed |
| Short-name string (SampClkSrc, terminal names) | 256 |
| Long-string (SampClkTimebaseSrc, TaskChannels, device paths) | 1024 |
| Array (int32 data[]) | Pass `zeros(1,N,'type')` + N (typically N=32) |

If buffer is too small, NI returns Error -200228 with "Required Buffer Size
in Bytes: N" — parse and retry with that value.

----

Copyright 2026 The MathWorks, Inc.

----
