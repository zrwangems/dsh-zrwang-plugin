# Function: `countlabels`

> Used in: wf-load-and-split.md
> Toolbox: Signal Processing Toolbox

One-line per-class count for a label source. Use as a sanity check before
splitting.

## Signature

```matlab
T = countlabels(lblsrc)
T = countlabels(lblsrc, Name=Value)
```

`lblsrc` accepts:
- **categorical / string / logical / numeric vector**
- **cell array** of character vectors / numeric scalars / logical scalars
- **table** — set `TableVariable` to pick the column
- **datastore** whose `readall` returns one of the above
- **`CombinedDatastore`** — set `UnderlyingDatastoreIndex` to pick the constituent

Returns a table with one row per category, columns:
- `Label` — the unique value (column renamed to the variable name when `TableVariable` is set)
- `Count` — number of items with that label
- `Percent` — share of total

## Name-value arguments (both)

| NV-pair | Default | Purpose |
|---|---|---|
| `TableVariable` | first table variable | Column to read when `lblsrc` is a table or a datastore-of-tables. Character vector or string scalar. |
| `UnderlyingDatastoreIndex` | required for `CombinedDatastore` | Integer scalar selecting which underlying datastore in a `CombinedDatastore` carries the labels. |

## Example

```matlab
labels = filenames2labels(sds, Extract = "G" + digitsPattern);
disp(countlabels(labels))
%       Label    Count    Percent
%       _____    _____    _______
%       G1         12      24.0
%       G2         13      26.0
%       G3         12      24.0
%       G4         13      26.0
```

## Why pre-flight

If a class has too few samples to support `splitlabels(labels, [0.7 0.15 0.15])`,
`splitlabels` will error — but `countlabels` lets you see the imbalance
before you commit to a split ratio.

## Gotchas

- **Output is a `table`.** Index with `T.Count` or `T{:, "Count"}`.
- **`<undefined>` shows up as a row.** If `filenames2labels`'s pattern
  failed to match some files, those land as `<undefined>` and
  `countlabels` will show them. Check with `any(ismissing(labels))`.

## See also

- `fn-splitlabels.md` — the consumer that errors on infeasible distributions.

----

Copyright 2026 The MathWorks, Inc.

----
