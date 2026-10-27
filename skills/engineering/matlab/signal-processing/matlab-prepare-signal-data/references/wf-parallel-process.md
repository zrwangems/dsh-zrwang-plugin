# Workflow: parallel processing across a parpool

> Functions used: `signalDatastore`, `partition`, `parfor`

Compute per-signal results across multiple workers when serial processing
is too slow. The canonical pattern is **one datastore shard per worker**,
not one datastore per file.

> **Off-ramp.** If you only need a train/val/test split (single worker),
> this isn't your workflow → see wf-load-and-split.md (uses `subset`, not
> `partition`).

## Recipe

### Step 1 — Bootstrap the parallel pool

You need `pool.NumWorkers` **before** the `parfor` to call
`partition(ds, N, k)`. `parfor` will spin up an implicit pool, but you
can't read `NumWorkers` until the pool exists. Bootstrap explicitly:

```matlab
pool = gcp("nocreate");
if isempty(pool)
    pool = parpool;
end
N = pool.NumWorkers;
```

If files are very uneven in size, ask the datastore for a
size-aware partition count instead:

```matlab
N = numpartitions(sds, pool);
```

`numpartitions` returns the datastore's recommended shard count given the
pool — usually `pool.NumWorkers`, but it can suggest more shards when
file sizes are skewed.

### Step 2 — Partition the datastore by worker

```matlab
results = cell(1, N);
parfor k = 1:N
    workerDs = partition(sds, N, k);
    workerOut = [];
    while hasdata(workerDs)
        s = read(workerDs);
        workerOut(end+1) = rms(s); %#ok<AGROW>
    end
    results{k} = workerOut;
end
```

Each worker gets a disjoint shard (~`numel(sds.Files)/N` files); the
union of all shards is exactly `sds.Files`. The shard is a real
`signalDatastore`, so all the usual `read` / `hasdata` / `readall`
operations work.

**Split is by alphabetical block, not round-robin.** Shard 1 gets the
alphabetically-first files, shard N gets the last. If your files are
class-grouped by name (e.g. `cat_*.mat` then `dog_*.mat`), one class can
end up entirely on one worker. Don't assume `partition` randomizes.

About `workerOut(end+1) = rms(s); %#ok<AGROW>`: `workerOut` is a
worker-local temporary, so the AGROW pragma is harmless. Don't import
this pattern to a `parfor`-sliced output array — `parfor` doesn't allow
those to grow.

### Step 3 — Reduce results

```matlab
results = [results{:}];   % concatenate per-worker arrays
```

If each worker produces a more complex shape (struct, table), use the
appropriate concat (`vertcat`, `outerjoin`, etc.) in step 3.

## Anti-pattern — datastore per file

Don't construct a fresh datastore inside the `parfor` body for each file.
That spawns `N=files` datastores (defeating the partition abstraction)
and serializes file metadata work onto every worker.

```matlab
% Bad — datastore per file:
parfor i = 1:numel(sds.Files)
    workerSds = signalDatastore(sds.Files{i});   % one fresh per file
    s = read(workerSds);
    results(i) = rms(s); %#ok<AGROW>
end

% Good — datastore per worker:
parfor k = 1:N
    workerDs = partition(sds, N, k);
    while hasdata(workerDs)
        s = read(workerDs);
        % ...
    end
end
```

## Anti-pattern — eager-load inside `ReadFcn`

If the datastore uses a custom `ReadFcn`, eager-loading inside it
(`load(file)` then discarding) wastes per-worker memory. Use named load or
`matfile`. See fn-signaldatastore.md.

## Gotchas

- **Shards are by file count, not data size.** Files with very uneven
  length give uneven worker runtime. For balanced parallelism, group
  files into bins of equal total samples first, or use
  `numpartitions(sds, pool)` for the size-aware shard count.
- **Scalar accumulator breaks on multichannel signals.**
  `workerOut(end+1) = rms(s)` assumes `rms(s)` is scalar. If `s` is
  multichannel (matrix), `rms(s)` returns a row vector and the row-write
  errors or silently broadcasts depending on shape. Either constrain to
  one channel (`workerOut(end+1) = rms(s(:,1));`) or use cell
  accumulation (`workerOut{end+1} = rms(s);`) and concatenate at the
  end.
- **Two senses of `partition`.** This workflow uses `partition(ds, N, k)`
  (parallel sense). The split sense uses `subset(ds, idx)` — see
  fn-subset.md and fn-partition.md disambiguator.

## Worked end-to-end example

```matlab
sds = signalDatastore("dataset", FileExtensions=".mat", ...
    SignalVariableNames="x");

pool = gcp("nocreate");
if isempty(pool)
    pool = parpool;
end
N = pool.NumWorkers;

results = cell(1, N);
parfor k = 1:N
    workerDs = partition(sds, N, k);
    workerOut = [];
    while hasdata(workerDs)
        s = read(workerDs);
        workerOut(end+1) = rms(s); %#ok<AGROW>
    end
    results{k} = workerOut;
end
results = [results{:}];
```

## Next in the chain

- **Building the datastore in the first place** → wf-load-and-split.md
  step 1.
- **Per-frame supervision** → wf-frame-and-label.md (you can also
  parallelize the framing transform — same partition pattern applies).

----

Copyright 2026 The MathWorks, Inc.

----
