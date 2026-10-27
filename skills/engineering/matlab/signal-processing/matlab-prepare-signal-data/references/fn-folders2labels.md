# Function: `folders2labels`

> Used in: wf-load-and-split.md
> Toolbox: Signal Processing Toolbox

Derive a categorical label vector from the **containing-folder name** of
each file. Use when class identity is encoded by sub-folder, e.g.
`data/classA/file01.mat`, `data/classB/file02.mat`.

## Signature

```matlab
labels = folders2labels(source)
labels = folders2labels(source, IncludeSubfolders=true)
labels = folders2labels(source, FileExtensions=".mat")
[labels, files] = folders2labels(___)
```

`source` accepts:
- Any datastore with a `Files` property (e.g. `signalDatastore`, `fileDatastore`).
- A folder path (string or char).
- A string array, or a cell array of char vectors, of file or folder paths.
- A `matlab.io.datastore.FileSet` or `matlab.io.datastore.BlockedFileSet`.
- Local paths may include `*` wildcards; remote IRIs (e.g. `hdfs:///...`) are also accepted.

Returns a `categorical` column vector, one entry per file. The label is
the name of the file's immediate parent folder.

The optional second output `files` is a string vector aligned to `labels`
(`files(k)` is the source file for `labels(k)`).

## Name-value arguments

| NV-pair | Default | Type | Notes |
|---|---|---|---|
| `IncludeSubfolders` | `true` | logical / numeric | Whether to recurse into subfolders. Default is already `true`, so omit unless you want `false`. |
| `FileExtensions` | (all extensions) | string scalar / string array / char / cell of char | Filters which file extensions are scanned, e.g. `FileExtensions=".csv"`. |

## Example

Folder layout:
```
data/
├── apple/
│   ├── 001.mat
│   └── 002.mat
└── banana/
    ├── 003.mat
    └── 004.mat
```

```matlab
sds = signalDatastore("data", FileExtensions=".mat", IncludeSubfolders=true);
labels = folders2labels(sds);
% labels = [apple; apple; banana; banana]   (categorical column)
```

## Anti-pattern

Don't hand-roll `fileparts(fileparts(path))` to derive folder labels.
`folders2labels` does this in one line and survives platform path-separator
differences.

```matlab
% Reusing sds from the Example block above.
% Bad — hand-rolled, brittle:
labels = arrayfun(@(f) string(...
    regexp(f, "data[/\\](\w+)[/\\]", "tokens", "once")), ...
    string(sds.Files));

% Good — one line:
labels = folders2labels(sds);
```

## Gotchas

- **Output is `categorical`.** Cast with `string(labels)` if you need string.
- **Order matches the source.** For a `signalDatastore` source, `labels(k)`
  is the label for `sds.Files{k}` — so `subset(sds, splitIndices{j})` and
  the same `splitIndices{j}` indexed into `labels` stay aligned.
- **Only the *immediate* parent folder is used as the label.** If your
  classes live two levels deep (`data/group1/classA/file.mat`), only
  `classA` becomes the label — `group1` is dropped.
- **`IncludeSubfolders=true` belongs on the upstream `signalDatastore`, not on `folders2labels`.**
  On `folders2labels` itself the default is already `true`. The recursion
  trap is on the *datastore* — the default `signalDatastore` constructor
  does *not* recurse, so without `IncludeSubfolders=true` on the
  `signalDatastore` call, only top-level files are listed and
  `folders2labels` has nothing under the class subfolders to label.

## See also

- `filenames2labels` — labels from filename pattern instead of folder name.
- For the chain `folders2labels` → `splitlabels` → `subset`, see
  wf-load-and-split.md (steps 2–4).

----

Copyright 2026 The MathWorks, Inc.

----
