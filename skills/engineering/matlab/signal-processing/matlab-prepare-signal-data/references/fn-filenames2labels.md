# Function: `filenames2labels`

> Used in: wf-load-and-split.md, wf-frame-and-label.md
> Toolbox: Signal Processing Toolbox

Derive a categorical label vector from filenames using a position-independent
pattern.

## Signature

```matlab
labels = filenames2labels(source)
labels = filenames2labels(source, Extract=pattern)
labels = filenames2labels(source, ExtractBefore=delimiter)
labels = filenames2labels(source, ExtractAfter=delimiter)
labels = filenames2labels(source, ExtractBetween=[startDelim endDelim])
labels = filenames2labels(source, FileExtensions=".wav")
labels = filenames2labels(source, IncludeSubFolders=true)
[labels, files] = filenames2labels(___)
```

`source` accepts:
- A `signalDatastore` (or any datastore exposing a `Files` property, e.g. `audioDatastore`).
- A folder path (string or char).
- A string array of filenames, or a cell array of char vectors.
- A `matlab.io.datastore.FileSet` or `matlab.io.datastore.BlockedFileSet`.
- Local paths may include `*` wildcards; remote IRIs (e.g. `hdfs:///...`) are also accepted.

Returns a `categorical` vector, one entry per file (column vector for the
single-output / single-match case). When `Extract=` matches multiple times per
filename, the return is a categorical **matrix** — one row per file, one column
per match — and all filenames must have the same number of matches.

The optional second output `files` is a string vector aligned to `labels`
(`files(k)` is the source file for `labels(k,:)`). Order matches the source's
file enumeration; for a `signalDatastore` it is `sds.Files`, for a folder
source it is the order returned by the file system. Use the two-output form
when you need a guaranteed pairing (e.g. wildcard or remote inputs).

## Name-value arguments

| NV-pair | Default | Type | Notes |
|---|---|---|---|
| `FileExtensions` | (all extensions) | string scalar / string vector / char / cell of char | Filters which file extensions are scanned. Applies only when `source` is a file location, not a datastore. |
| `IncludeSubFolders` | `true` | logical / numeric | Whether to recurse into subfolders. Applies only when `source` is a file location. (Casing per live doc: `IncludeSubFolders` on this function; `signalDatastore` uses `IncludeSubfolders`.) |
| `ExtractBefore` | — | string scalar / `pattern` / positive integer | Substring up to (but excluding) the delimiter or index. |
| `ExtractAfter` | — | string scalar / `pattern` / nonnegative integer | Substring starting after the delimiter or index, to end of name. |
| `ExtractBetween` | — | 2-element string / cell of char / vector of `pattern` / vector of positive integers | Substring between two delimiters or indices `[P S]`. |
| `Extract` | — | `pattern` object | Substring matching the `pattern`. Multi-match → matrix output. |

## Pattern forms (Extract — preferred)

`Extract=` takes a `pattern` object. Position-independent — survives filename-format variation.

| Filename shape | Extract pattern |
|---|---|
| `subj_G42.mat` (letter prefix + digits) | `"G" + digitsPattern` |
| `ClassA_01.csv` (literal prefix + single letter) | `"Class" + lettersPattern(1)` |
| `2026-05-26_run3.wav` (date prefix) | `digitsPattern + "-" + digitsPattern + "-" + digitsPattern` |
| `apple_001.mat` / `banana_002.mat` (variable-length class name + digits) | `lettersPattern + "_" + digitsPattern` |

## Anti-pattern

Don't use `extractBefore(name, "_")` or `extractBetween(name, "_", "_")` to
derive labels. Position-based extraction silently produces wrong labels when
filename format varies (e.g. `subj01_G42` vs `subj004_G42` — `extractBefore("_")`
returns `"subj01"` and `"subj004"` respectively, not `"G42"`).

```matlab
% Bad — silent wrong labels when format varies:
names = string({sds.Files{:}});
labels = extractBefore(names, "_");

% Good — position-independent:
labels = filenames2labels(sds, Extract = "G" + digitsPattern);
```

## Gotchas

- **Output is `categorical`.** Cast with `string(labels)` if you need string.
- **`lettersPattern` is greedy.** For single-letter class tokens (`ClassA`,
  `ClassB`), pin with `lettersPattern(1)` to match exactly one letter:
  `"Class" + lettersPattern(1)` not `"Class" + lettersPattern`.
- **Extract failure is silent.** If the pattern doesn't match a filename,
  the label for that file is `<undefined>`. Check with `summary(labels)` or
  `any(ismissing(labels))`.
- **Order matches the source.** For a `signalDatastore` source, `labels(k)`
  is the label for `sds.Files{k}` — so `subset(sds, splitIndices{j})` and
  the same `splitIndices{j}` indexed into `labels` stay aligned.

## See also

- `digitsPattern`, `lettersPattern`, `lettersPattern(N)` — `pattern` object
  primitives (MATLAB; not Signal Toolbox). Use these to compose `Extract=`.
- For the chain `filenames2labels` → `splitlabels` → `subset`, see
  wf-load-and-split.md (steps 2-4).

----

Copyright 2026 The MathWorks, Inc.

----
