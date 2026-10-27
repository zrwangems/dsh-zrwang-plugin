# Functions: `signalMask` + `catmask` / `binmask` / `roimask`

> Used in: wf-frame-and-label.md
> Toolbox: Signal Processing Toolbox

Build a per-sample categorical mask from an ROI table, a categorical
sequence, or a matrix of binary sequences. Use when supervision is
per-sample (not per-frame) — for example, a dense segmentation network
that emits one label per sample.

## Signatures

```matlab
msk     = signalMask(src)                                  % construct (any source form)
msk     = signalMask(src, Name=Value, ...)                 % with property NV-pairs

seq     = catmask(msk)                                     % categorical seq, source-length default
seq     = catmask(msk, len)                                % categorical seq of length len
seq     = catmask(___, OverlapAction=action)               % overlap policy (default 'error')
seq     = catmask(___, OverlapAction="prioritizeByList", PriorityList=idxlist)
[seq, numroi, cats] = catmask(___)

seqs    = binmask(msk)                                     % matrix of binary sequences
seqs    = binmask(msk, len)
[seqs, numroi, cats] = binmask(___)

tbl     = roimask(msk)                                     % round-trip to ROI table
[tbl, numroi, cats]  = roimask(msk)

slices  = extractsigroi(msk, signal)                       % per-region signal slices
plotsigroi(msk, signal)                                    % plot signal with colored ROIs
```

> When `SourceType` is `'roiTable'`, `len` is **required** for `catmask` /
> `binmask`. When `SourceType` is `'categoricalSequence'` or
> `'binarySequences'`, omitting `len` defaults to the source's own length.

## Input forms (3)

`src` accepts three forms; the chosen form is recorded in the read-only
`SourceType` property.

| Form | Shape | Example | `SourceType` |
|---|---|---|---|
| ROI table | Table whose **first variable** is an Mx2 numeric matrix of `[start end]` limits and **second variable** is a categorical or string array of labels. Variable names are not required to be `ROILimits` / `Value`. | `signalMask(table([2 4;6 7], ["male" "female"]'))` | `"roiTable"` |
| Categorical vector sequence | Categorical vector; contiguous same-value runs become regions; `<undefined>` marks gaps between regions. | `signalMask(categorical(["" "A" "A" "" "B"]'))` | `"categoricalSequence"` |
| Binary-sequence matrix | Mx P logical matrix; column `i` marks region samples for category `i`. Use `Categories` NV-pair to name the columns; otherwise they are labeled `"1" .. "P"`. | `signalMask([0 1 1 0; 0 0 1 1]', Categories=["A" "B"])` | `"binarySequences"` |

If `SampleRate` is set, ROI-table limits are interpreted as **seconds**
(not sample indices) and rounded to nearest positive integer.

## Construction NV-pairs

Settable at construction (also writable after, except where noted):

| NV-pair | Type | Default | Notes |
|---|---|---|---|
| `SampleRate` | positive numeric scalar | unset | When set, ROI-table limits are interpreted as seconds. When unset, limits are sample indices. Read-only after construction. |
| `Categories` | string vector / cell of char | inferred (`["1" .. "P"]` for binary source) | Settable only when `src` is a binary-sequence matrix; read-only otherwise. |
| `LeftExtension` | nonnegative integer | `0` | Extend each region this many samples to the left. Truncated at sequence start. |
| `RightExtension` | nonnegative integer | `0` | Extend each region this many samples to the right. |
| `LeftShortening` | nonnegative integer | `0` | Shorten each region this many samples from the left. Regions shortened to zero length are removed. |
| `RightShortening` | nonnegative integer | `0` | Shorten each region this many samples from the right. |
| `MergeDistance` | nonnegative integer | `0` | Merge same-category regions separated by this many samples or fewer. Contiguous / overlapping / repeated regions are always merged. |
| `MinLength` | positive integer | `1` | Drop regions shorter than this many samples. |

Modification order applied by the object: extend → shorten → merge → drop-short.

Read-only / post-construction-only properties (cannot be set as NV-pairs
at construction): `SourceType`, `SpecifySelectedCategories`,
`SelectedCategories`.

## `catmask` overlap NV-pairs

| NV-pair | Type | Default | Notes |
|---|---|---|---|
| `OverlapAction` | `"error"` \| `"prioritizeByList"` | `"error"` | When `"error"`, `catmask` **throws** if regions of different categories overlap. When `"prioritizeByList"`, overlapping samples are resolved by priority. |
| `PriorityList` | integer vector indexing `Categories` | `Categories` order | Used when `OverlapAction="prioritizeByList"`. First entry is highest priority; must contain indices for all entries in `Categories`. |

`binmask` and `roimask` accept no overlap-handling NV-pairs (they don't
need one — `binmask` returns one column per category, and `roimask`
returns the ROI table directly).

## Object methods

| Method | Returns |
|---|---|
| `catmask(msk[, len])` | Categorical sequence; one label per sample, `<undefined>` outside ROIs. |
| `binmask(msk[, len])` | Logical matrix, **one column per category** (size `len × P`). Not a single-class vector. |
| `roimask(msk)` | ROI table (round-trip). |
| `extractsigroi(msk, signal)` | Cell array of per-region slices of `signal`. |
| `plotsigroi(msk, signal)` | Plots `signal` with regions colored by category — sanity-check helper. |

## Canonical pattern

```matlab
% First variable is an Mx2 matrix of limits; second is the label array.
% Column names are not required to be "ROILimits" / "Value".
rois = table([100 400; 500 900], categorical(["A"; "B"]));
msk  = signalMask(rois);

% Per-sample categorical for a 1000-sample signal.
% (len is required because SourceType is "roiTable".)
seq  = catmask(msk, 1000);
% seq is 1000x1 categorical with values <undefined>, A, or B.
```

If your data has overlapping ROIs across categories, supply
`OverlapAction` explicitly — the default errors:

```matlab
% Waveform-segmentation pattern: prefer QRS over P over T.
% PriorityList indexes into Categories; first index = highest priority.
seq = catmask(msk, signalLength, ...
    OverlapAction="prioritizeByList", ...
    PriorityList=[2 1 3]);
```

## Per-sample vs per-frame

| Need | Use |
|---|---|
| One label per **sample** (dense segmentation) | `signalMask` + `catmask` |
| One label per **frame** (windowed classification) | `framelbl` — see fn-framelbl.md |

Don't materialize per-sample with `catmask` and then pool to per-frame by
hand. `framelbl` consumes the ROI table directly and is faster.

## Anti-pattern — hand-rolled fill

Don't manually index a table to fill a per-sample vector. `catmask` does
this in one call.

```matlab
% Bad — hand-rolled fill:
seq = repmat(categorical(missing), 1000, 1);
for i = 1:height(rois)
    seq(rois.Var1(i,1):rois.Var1(i,2)) = rois.Var2(i);
end

% Good:
msk = signalMask(rois);
seq = catmask(msk, 1000);
```

## Gotchas

- **`signalMask` is lazy.** The object holds the source; `catmask` /
  `binmask` / `roimask` materialize. For very long signals you may not
  want to materialize at all — query specific ranges via `extractsigroi`
  instead.
- **`binmask` is per-category, not single-class.** Output is a
  `len × P` logical matrix (one column per category). Don't bind it to
  a `binVec` variable expecting a vector.
- **Method name is `catmask`, not `getmask`.** Calling `getmask(msk, N)`
  on a `signalMask` object errors with "Unrecognized method". Note: the
  *Waveform Segmentation Using Deep Learning* doc example defines a
  user-helper file `getmask.m` that wraps `catmask` — that's a private
  helper in the example, not a method on the object.
- **`OverlapAction` defaults to `"error"`.** `catmask(msk, len)` with no
  NV-pair **throws** when regions of different categories overlap. Pass
  `OverlapAction="prioritizeByList"` (with optional `PriorityList`) to
  resolve overlaps. `binmask` doesn't need this — separate column per
  category.
- **Samples not covered by any ROI are `<undefined>`.** If your
  segmentation expects a "background" class, fill explicitly:
  `fillmissing(seq, "constant", "background")`.
- **`SampleRate` flips ROI-limit units.** Without `SampleRate`, limits
  are sample indices; with `SampleRate=Fs`, they are seconds. Switching
  between the two re-interprets the same numbers.
- **Modification order is fixed**: extend → shorten → merge → drop-short.
  Stacking `LeftExtension=2` and `LeftShortening=2` is not a no-op —
  extension happens first, then shortening trims from the new left edge.

## See also

- `fn-framelbl.md` — per-frame counterpart with consolidation semantics.
- `wf-frame-and-label.md` — both routes covered.

----

Copyright 2026 The MathWorks, Inc.

----
