# Common Mistakes with calldaqlib

Mistakes observed in agent discovery trials (Phase 1) and customer usage.

## Projection-layer mistakes

| Mistake | Error / symptom | Correct approach |
|---------|----------------|-----------------|
| `int32(10280)` for enum slot | Code works but is unreadable; wrong-enum bugs silently pass | Use string: `"DAQmx_Val_RisingSlope"` |
| `[status, val] = calldaqlib(...)` | Too many output arguments | Single output: `result = calldaqlib(...); val = result("Dev1_ai0")` |
| Omitting `""` for string getter | "Function requires 1 more input(s)" | `calldaqlib(dq, "DAQmxGetSampClkSrc", "", 256)` |
| `blanks(256)` as string placeholder | Works but non-canonical, confuses readers | `""` is the correct placeholder |
| Empty `[]` for array getter | Returns empty/zero result | `zeros(1, 32, "int32")` with matching C type |
| `bufferSize = 10` for string getter | NI Error -200228 (buffer too small) | Use 256 minimum, 1024 for long strings |

## Ordering mistakes

| Mistake | Error / symptom | Correct approach |
|---------|----------------|-----------------|
| Setting rate via calldaqlib then calling `start()` | Rate silently clobbered back to `dq.Rate` | Set `dq.Rate` first, or use `DAQmxStartTask`/`DAQmxStopTask` |
| Setting retriggerable before configuring trigger type | CfgDigEdgeStartTrig resets retriggerable to false | Always configure trigger type first, then enable retriggerable |

## Scope mistakes

| Mistake | Error / symptom | Correct approach |
|---------|----------------|-----------------|
| `DAQmxCreateTask` via calldaqlib | taskHandle prepended but API doesn't accept one | Not possible through calldaqlib |
| `DAQmxConnectTerms` via calldaqlib on daq with channels | taskHandle injected, shifts args | Use empty daq: `dEmpty = daq("ni")` — works on X-series devices |
| Device-level API on daq with channels | taskHandle injected, shifts args, type errors | Use empty daq: `dEmpty = daq("ni")` |
| Setter on multi-task daq (AI+DIO) | Call runs on both tasks; no scoping | Split into separate daq objects for measurement-specific setters |

## Mental-model mistakes

| Mistake | Error / symptom | Correct approach |
|---------|----------------|-----------------|
| Expecting bare scalar from getter | Code fails on dictionary indexing | All task-level getters return `dictionary` keyed by `DevN_chanName` |
| Assuming all devices support all triggers | NI Error -200077 | Read the error — it lists supported trigger types for that device |
| Passing vector where scalar expected | "Value must be a scalar" | Loop over channels; projection doesn't broadcast |


## API-name mistakes

| Mistake | Error / symptom | Correct approach |
|---------|----------------|-----------------|
| `DAQmxGetTimingAttribute` or `DAQmxGetChanAttribute` (generic attribute getters) | "Not enough input arguments" — function not recognized | Use specific function names: `DAQmxGetSampClkRate`, `DAQmxGetSampClkSrc`, etc. |
| `DAQmxSetStartTrigRetriggerable` with `ContSamps` | NI Error -201320: retriggering requires finite task with start trigger | Use `DAQmx_Val_FiniteSamps` in `DAQmxCfgSampClkTiming` before enabling retriggerable |

----

Copyright 2026 The MathWorks, Inc.

----
