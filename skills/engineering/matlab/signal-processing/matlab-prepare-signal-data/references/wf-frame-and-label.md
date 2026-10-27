# Workflow: frame long signals + per-frame labels

> Functions used: `signalDatastore`, `framesig`, `framelbl`, `splitlabels`, `subset`

Per-frame supervision: long signals, each file containing many windowed
observations with their own labels. Joint framing of signal and labels.

> **Off-ramp.** If each file is one observation (one signal → one label),
> see wf-load-and-split.md instead.

## Recipe

### Step 1 — Construct the datastore

For ROI-bearing files, load the ROI table alongside the signal:

```matlab
sds = signalDatastore("dataset", FileExtensions=".mat", ...
    SignalVariableNames=["x", "rois"]);
```

`read(sds)` returns a `2×1` cell per file: `{signal; roiTable}` (default
`ReadOutputOrientation="column"`). Linear indexing `c{1}` / `c{2}` works
for either orientation, so the rest of this workflow doesn't depend on the
choice.

### Step 2 — Frame the signal

```matlab
frames = framesig(x, frameLength, OverlapLength=overlap);
% frames is frameLength × numFrames
```

See fn-framesig.md for parameter detail.

### Step 3 — Frame the labels with the same schedule

```matlab
frameLabels = framelbl(rois, frameLength, OverlapLength=overlap, ...
    ConsolidationMethod="mode");
% frameLabels is 1 × numFrames, aligned with frames(:, k)
```

**Decision point — `ConsolidationMethod`.** When ROIs overlap a frame
boundary, you must decide which label wins. Valid values are `"none"`
(default — returns the per-frame raw labels as an `fl × numFrames` matrix,
one column per frame), `"mode"`, `"priority"`, `"max"`, `"median"`,
`"mean"`. Two most common for classification:

- `"mode"` — most-prevalent: the label covering the most samples in the frame.
- `"priority"` — explicit rank order via `PriorityList`.

**Anti-pattern: hand-rolled most-prevalent voting** with a `containers.Map`
accumulator has a *containment trap* — a label whose ROI is fully nested
inside another's ROI never wins a most-prevalent vote. If your labels
nest (e.g. `voiced` inside `speech`), use `priority` with an explicit
`PriorityList`. See fn-framelbl.md for the trap detail.

### Step 4 — Wrap framing into a `transform` for training

One frame per network observation. Wrap steps 2-3 in a transform:

```matlab
sdsFrames = transform(sds, @(c) {framesig(c{1}, frameLength, ...
    OverlapLength=overlap), framelbl(c{2}, frameLength, ...
    OverlapLength=overlap, ConsolidationMethod="mode")});
```

`transform` returns a datastore whose `read()` yields `{frames, frameLabels}`
per file.

### Step 5 — Split (per-file or per-frame)

If the split is **per-file** (frames from the same file stay together —
common to avoid leakage), use the same `splitlabels` + `subset` chain as
wf-load-and-split.md, on a file-level label:

```matlab
fileLabels = filenames2labels(sds, Extract = "subj" + digitsPattern);
splitIndices = splitlabels(fileLabels, [0.7 0.15 0.15]);
sdsTrain = subset(sds, splitIndices{1});
% then transform sdsTrain (not sds) into frames.
```

If the split is **per-frame** (frames are i.i.d. observations regardless
of source file), materialize the framed datastore first and split on the
per-frame label vector. Less common and risks leakage if a single
observation spans the split boundary.

## Anti-patterns (recap)

| Anti-pattern | Why | Detail |
|---|---|---|
| Manual `(i-1)*hopSize+1` framing loop | Reinvents `framesig`; misses streaming semantics | fn-framesig.md |
| `containers.Map` per-sample voting for frame labels | Containment trap — nested labels never win | fn-framelbl.md |
| Splitting per-frame when frames come from the same source file | Leaks information across train/val/test | This file, step 5 |

## Worked end-to-end example

```matlab
sds = signalDatastore("dataset", FileExtensions=".mat", ...
    SignalVariableNames=["x", "rois"]);

frameLength = 1024;
overlap     = 512;

sdsFrames = transform(sds, @(c) { ...
    framesig(c{1}, frameLength, OverlapLength=overlap), ...
    framelbl(c{2}, frameLength, OverlapLength=overlap, ...
        ConsolidationMethod="priority", ...
        PriorityList=["voiced","unvoiced","silence"]) ...
});

% Per-file split:
fileLabels = filenames2labels(sds, Extract = "subj" + digitsPattern);
splitIndices = splitlabels(fileLabels, [0.7 0.15 0.15]);

% Apply the same framing transform on the train subset:
sdsTrain = transform(subset(sds, splitIndices{1}), @(c) { ...
    framesig(c{1}, frameLength, OverlapLength=overlap), ...
    framelbl(c{2}, frameLength, OverlapLength=overlap, ...
        ConsolidationMethod="priority", ...
        PriorityList=["voiced","unvoiced","silence"]) ...
});
```

## Next in the chain

- **Per-file label workflow** (each file = one observation, no framing) →
  wf-load-and-split.md.
- **Hand-off to `trainnet` / `dlarray`** → wf-handoff-to-dl.md.

----

Copyright 2026 The MathWorks, Inc.

----
