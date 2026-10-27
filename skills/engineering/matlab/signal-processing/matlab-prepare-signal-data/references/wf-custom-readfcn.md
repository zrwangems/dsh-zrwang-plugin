# Workflow: custom `ReadFcn` (only when needed)

> Functions used: `signalDatastore`

End-to-end recipe for authoring a custom reader. Use only when the file
format is **not** `.mat` / `.csv`, or when there's a metadata prelude the
default reader can't parse. (`.wav` is not in the default-reader scope —
it requires `audioDatastore` or a custom `ReadFcn`.)

> **Off-ramp.** If your files are `.csv` or `.mat` with multiple variables,
> the default reader handles them via `SignalVariableNames` — no custom
> `ReadFcn` needed → see fn-signaldatastore.md.

## Decision tree before reaching for `ReadFcn`

1. **Is the file `.mat` or `.csv`?** Default reader probably works.
   (`.wav` is **not** in the default-reader scope.)
2. **Multi-column or named variables?** `SignalVariableNames` NV-pair.
3. **Sample rate in a column or variable?** `SampleRateVariableName` NV-pair.
4. **Only then** → custom `ReadFcn`.

If you're here because a reflex said "non-standard input → custom
function", reset and check the NV-pair list in fn-signaldatastore.md
first. Tabular CSV doesn't need a custom `ReadFcn`.

## Recipe

### Step 1 — Author the reader

```matlab
function [data, info] = myReader(filename)
    % Open file, parse header, read signal:
    fid = fopen(filename, "rb");             % binary mode
    header = fread(fid, 16, "uint8");        % example: 16-byte prelude
    fs     = double(typecast(uint8(header(1:8)), "double"));
    data   = fread(fid, Inf, "single");
    fclose(fid);

    % info surfaces per-file metadata to downstream consumers:
    info.SampleRate = fs;
end
```

If the reader has nothing to surface beyond the data itself, the 1-output
form is sufficient — see "Signature" below.

### Step 2 — Wire it into the datastore

```matlab
sds = signalDatastore(folder, ...
    FileExtensions=".dat", ...
    ReadFcn=@myReader);
```

### Step 3 — Verify

```matlab
[data, info] = read(sds);
disp(class(data))      % what your reader returned
disp(info.FileName)    % datastore appends this automatically
```

## Worked example — `.wav` without Audio Toolbox

When `audioDatastore` (Audio Toolbox) isn't available, `audioread`
(base MATLAB) is the canonical fallback for raw `.wav` ingestion:

```matlab
sds = signalDatastore(dataFolder, ...
    FileExtensions=".wav", ...
    ReadFcn=@readWav);

function [data, info] = readWav(filename)
    [data, fs] = audioread(filename);
    info.SampleRate = fs;
end
```

`audioread` is in base MATLAB, so this works without Audio Toolbox.
When Audio Toolbox is on the path, prefer `audioDatastore` — it
handles label-source overloads and streaming out of the box.

(Don't set `info.FileName` — the datastore appends it automatically.)

## Signature

Both forms are valid:

```matlab
function data = fn(filename)              % 1-output
function [data, info] = fn(filename)      % 2-output
```

Use the 2-output form **only when** the reader needs to attach per-file
metadata to `info` (e.g. `info.SampleRate` for variable-rate files).
Otherwise the 1-output form is cleaner.

`info.FileName` is appended by the datastore automatically; user-supplied
values are overwritten, so don't set it.

## Anti-pattern — eager-load

Don't `load(file)` inside the reader and discard most variables. At scale
this wastes memory proportional to total file size, not to the variable
you actually need. Use `load(file, "x")` with named variables, or
`matfile` for lazy access:

```matlab
% Bad:
function data = badReader(filename)
    s = load(filename);     % loads everything
    data = s.x;
end

% Good — named load:
function data = goodReader(filename)
    s = load(filename, "x");
    data = s.x;
end

% Better — matfile lazy access:
function data = lazyReader(filename)
    m = matfile(filename);
    data = m.x;
end
```

## Anti-pattern — wrapping `readtable` for tabular CSV

If your CSV has named columns and you want a subset, the default reader
does it directly:

```matlab
% Bad — custom ReadFcn for tabular CSV:
sds = signalDatastore(folder, ReadFcn=@(f) ...
    table2array(readtable(f, "SelectedVariableNames", ["ch1","ch2"])));

% Good — default reader, NV-pair:
sds = signalDatastore(folder, FileExtensions=".csv", ...
    SignalVariableNames=["ch1","ch2"]);
```

## Gotchas

- **Pick the signature deliberately.** 1-output if the reader has nothing
  to attach beyond the data; 2-output only when you need `info.SampleRate`
  or other per-file metadata.
- **Don't set `info.FileName`.** The datastore overwrites it.
- **`ReadFcn` is called once per file, not once per `read(sds)` call** —
  the datastore caches reads as it advances. Don't put per-batch state
  inside the reader.
- **`ReadFcn` runs on workers in parallel processing.** Don't capture
  workspace variables (closure) — pass them via the file or as
  reader-local constants.

## See also

- `fn-signaldatastore.md` — full NV-pair table of default-reader options.
- `wf-load-and-split.md` — the canonical workflow that *doesn't* need a
  custom `ReadFcn`.

----

Copyright 2026 The MathWorks, Inc.

----
