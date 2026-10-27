# Workflow: load + label + split

> Functions used: `signalDatastore`, `filenames2labels`, `folders2labels`, `splitlabels`, `subset`, `countlabels`

A folder of files becomes three datastores (train/val/test). Four steps:
construct → label → check distribution → split.

> **Off-ramp.** If supervision is per-frame inside long signals (one file
> contains many labeled windows), see wf-frame-and-label.md instead.

## Recipe

### Step 1 — Construct the datastore

Pick the constructor based on file format and where the signal lives:

| Input shape | Constructor | Detail |
|---|---|---|
| `.mat` files, single signal variable | `signalDatastore(folder, FileExtensions=".mat")` | fn-signaldatastore.md |
| `.mat` files, named variable(s) | `signalDatastore(folder, FileExtensions=".mat", SignalVariableNames="x")` | fn-signaldatastore.md |
| `.csv` files, single column | `signalDatastore(folder, FileExtensions=".csv")` | fn-signaldatastore.md |
| `.csv` files, multi-column (pick subset) | `signalDatastore(folder, FileExtensions=".csv", SignalVariableNames=["ch1","ch2"])` | fn-signaldatastore.md |
| `.csv` files, sample-rate column | `signalDatastore(folder, FileExtensions=".csv", SampleRateVariableName="fs")` | fn-signaldatastore.md |
| Non-tabular format (custom binary, metadata prelude) | Custom `ReadFcn` | wf-custom-readfcn.md |

**Always set `FileExtensions`** when the data folder also contains scripts or
sub-folders. The NV-pair is the canonical filter — not a glob in the location.

**Anti-pattern.** Don't reach for a custom `ReadFcn` for tabular CSV. The
default reader covers it via `SignalVariableNames`.

### Step 2 — Derive labels

Pick the label source:

| Where labels live | Call | Detail |
|---|---|---|
| In the filename (e.g. `subj_G42.mat`) | `filenames2labels(sds, Extract = "G" + digitsPattern)` | fn-filenames2labels.md |
| In the containing subfolder name (e.g. `data/classA/file01.mat`) | `folders2labels(location)` | fn-folders2labels.md |
| In a column / variable inside the file | `SignalVariableNames` on the constructor — load the label alongside the signal | fn-signaldatastore.md |
| In an ROI table inside the file | `signalMask` + `catmask` for per-sample, `framelbl` for per-frame | fn-signalmask-getmask.md, wf-frame-and-label.md |

**Anti-pattern.** Don't write `regexp` / `extractBefore("_")` /
`extractBetween("_","_")` for filename labels. Position-based extraction
silently produces wrong labels when filename format varies. See
fn-filenames2labels.md for position-independent forms.

**Anti-pattern.** Don't write a `for` loop calling `load(file)` to extract
labels from in-file variables. That eager-loads gigabytes to read kilobytes.
Use `SignalVariableNames` to name the label column directly.

### Step 3 — Check the distribution

```matlab
countlabels(labels)
```

One-line balance check. If a class has too few samples for the split ratios
you want, `splitlabels` will tell you in step 4.

### Step 4 — Stratified split

```matlab
splitIndices = splitlabels(labels, [0.7 0.15 0.15]);
sdsTrain = subset(sds, splitIndices{1});
sdsVal   = subset(sds, splitIndices{2});
sdsTest  = subset(sds, splitIndices{3});
```

`splitlabels` returns an `(N+1)`-element **cell array** of index vectors,
where N is the number of split ratios. Full contract in fn-splitlabels.md.

**Anti-pattern.** Don't use `cvpartition` for datastore-backed splits. It
requires materializing labels first and doesn't compose with `subset(ds, idx)`.
The canonical chain is `splitlabels` → `subset`.

To verify the split is stratified, re-run `countlabels` per split:

```matlab
countlabels(labels(splitIndices{1}))   % train
countlabels(labels(splitIndices{2}))   % val
countlabels(labels(splitIndices{3}))   % test
```

The per-class proportions should match across splits (`splitlabels`
stratifies by default).

The three datastores are ready for training; `trainnet`-side shaping is in
wf-handoff-to-dl.md.

## Worked end-to-end example

```matlab
sds = signalDatastore("dataset", FileExtensions=".mat", SignalVariableNames="x");
labels = filenames2labels(sds, Extract = "G" + digitsPattern);
disp(countlabels(labels))

splitIndices = splitlabels(labels, [0.7 0.15 0.15]);
sdsTrain = subset(sds, splitIndices{1});
sdsVal   = subset(sds, splitIndices{2});
sdsTest  = subset(sds, splitIndices{3});
```

## Next in the chain

- **Per-frame supervision inside long signals** (after this workflow, or
  instead of it for a per-window task) → wf-frame-and-label.md.
- **Hand-off to `trainnet` / `dlarray`** (the immediate next step once the
  three datastores are ready) → wf-handoff-to-dl.md.

----

Copyright 2026 The MathWorks, Inc.

----
