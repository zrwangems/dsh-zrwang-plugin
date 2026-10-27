# Using Tall Arrays Effectively

Guidance for writing correct, efficient tall array code once you have chosen the
datastore + tall path (see the Decision Flowchart in SKILL.md). Read this when a
workflow converts in-memory code to tall, hits an unsupported operation, or needs
to minimize passes over the data.

## Lazy Evaluation: Defer Work, Gather Once

Tall arrays are **unevaluated** until you request results. MATLAB queues every
operation and, when you finally trigger evaluation, optimizes the whole queue to
minimize passes through the data. The more you queue before evaluating, the more
MATLAB can optimize.

- `gather` runs the queued operations and brings the **entire** result into memory.
  It is the bridge from tall back to in-memory arrays. Call it **only when you need
  the output**, and as late as possible.
- **Always ensure the result returned by `gather` can fit in memory.** If you call
  `gather` directly on a tall array without first reducing its size with a function
  such as `mean` (or `groupsummary`, `head`, `topkrows`), MATLAB might run out of memory.
- `if`/`while` (and other branch or loop conditions) *can* take a tall value, but
  evaluating the condition forces a `gather` and triggers execution then and there.
  Avoid branching or looping on a tall array — restructure so control flow does not
  depend on a tall value.
- Some functions (`plot`, `histogram`, `fitlm`) evaluate tall inputs automatically.

**Combine multiple results into a single `gather`.** Evaluating separately forces a
full data pass each time; batching lets MATLAB share passes.

```matlab
% GOOD — one gather, one optimized set of passes
[mu, sig] = gather(mean(tt.Value, "omitnan"), std(tt.Value, "omitnan"));

% AVOID — two gathers force two independent scans of the data
mu  = gather(mean(tt.Value, "omitnan"));
sig = gather(std(tt.Value, "omitnan"));
```

Queuing dependent steps before gathering also cuts passes:

```matlab
adj = tt.ArrDelay - mean(tt.DepDelay, "omitnan");
adj = adj - mean(adj, "omitnan");
gather(head(adj))   % evaluated together in fewer passes than step-by-step
```

## Previewing Without Running Out of Memory

`gather` on a full tall array will error (or thrash) if the result does not fit in
memory. To inspect data, gather only a bounded slice:

```matlab
gather(head(tt))        % first 8 rows (default); head(tt,k) for k rows
gather(tail(tt))        % last rows
gather(tt(1:100:end,:)) % every 100th row
summary(tt)             % per-variable min/max/mean, missing & category counts
```

- Unknown sizes/values display as `?` until evaluated — expect this, it is not an error.
- If a full result genuinely will not fit in memory, `write` it to disk (as a new
  datastore) instead of gathering.

## Indexing Rules That Trip People Up

Parenthesis indexing returns a new tall array (no evaluation):

```matlab
first10  = tt(1:10, :);              % row range
westOnly = tt(tt.Region == "West", :); % logical index, same-height tall logical
lastVar  = tt(end-5:end, "Value");   % end works
top12    = gather(topkrows(tt, 12, 2)); % sorted top-k WITHOUT sorting the whole array
```

Constraints to respect:
- Tables, timetables, and tall **row** vectors require **two subscripts** — `tt(1:10,:)`,
  not `tt(1:10)`. Linear indexing on ≥2-D arrays is not supported.
- Logical indexing requires the logical to be derived from the **same** tall array and
  not re-indexed differently in the first dimension. Same rule for concatenation
  (`[tt.A tt.B]`) — operands must trace back to one tall array.
- Extract a variable with dot notation: `tt.Value`, and drill in with `tt.Value(1:5)`.
- You cannot assign a tall array into a regular (in-memory) table.
- Do **not** write a `for` loop that iterates over each element or each row of a
  tall array — it is not performant. Write vectorized code instead, use
  `groupsummary` or `splitapply` for per-group work, and use
  `matlab.tall.transform` for custom logic applied to each block of data.

## When a Function Is Not Supported by Tall

This is where migrating to a tall workflow often goes wrong. Do **not** invent a
workaround and assume it is correct. Follow this sequence:

1. **Confirm support first.** Check the function's documentation for a "Tall Arrays"
   section / "This function supports tall arrays" note before using it in a tall
   pipeline. Do not guess.
2. **Prefer a supported equivalent** over a hand-rolled replacement:

   | Instead of (unsupported / eager) | Use (tall-supported) |
   |---|---|
   | `sort(tt)` then take the top rows (on a tall array `sort` needs an explicit dimension, and `sort(tt,1)` is allowed only for tall **column vectors**) | `topkrows(tt, k, "Var")` for the top *k* rows — it avoids sorting the whole array. Use `sortrows(tt, "Var")` only when the **entire** dataset must be reordered |
   | `unique` + manual per-group loop | `groupsummary(tt, "Group", "mean", "Var")` / `splitapply` with `findgroups` |
   | `for` loop over rows | vectorized tall expression, or `matlab.tall.transform` for a custom per-chunk function |
   | indexing with `find(...)` results eagerly | keep the logical tall array and index with it directly |
   | `arrayfun`/`cellfun` when the function is **not element-wise** — it needs a whole chunk at once or state across elements | `matlab.tall.transform` — it receives a whole chunk at a time |

3. **For genuinely custom logic**, use the documented extension points
   (`matlab.tall.transform`, `matlab.tall.reduce`, `matlab.tall.blockMovingWindow`)
   rather than gathering early to run in-memory code. Gathering to work around a
   limitation defeats the purpose and can exhaust memory.

## Always Validate Against the In-Memory Result

A tall workaround can run without error yet produce **wrong** results silently.
Before you apply the new tall code to the full dataset, run the tall code and the
original in-memory code on **the same** sample — one small enough to fit in memory —
and compare like for like:

```matlab
sampleT    = gather(head(tt, 1000));   % a subset that fits in memory
ttSample   = tall(sampleT);            % the SAME data, as a tall array

tallResult = gather(myPipeline(ttSample));   % tall path on the sample
refResult  = myPipeline(sampleT);            % in-memory path on the same sample

% Match the comparison to the operation:
% - Exact for indexing, selection, and reordering (row filtering, topkrows, sortrows):
assert(isequal(tallResult, refResult), ...
    "Tall selection diverges from in-memory reference");

% - Within a tolerance for reductions and numeric algorithms (mean, std, regressions),
%   where a different accumulation order can legitimately change the last bits:
tol = 1e-10;   % adjust to the data: loosen for single precision or large-magnitude
               % values; tighten for exact integer counts
assert(max(abs(tallResult - refResult), [], "all") <= tol, ...
    "Tall reduction diverges beyond tolerance");
```

Compare reductions (means, counts, group summaries) or `head`/`topkrows` slices — never
`gather` two full large arrays just to compare them. Use the exact check (`isequal`)
only where the result must match bit for bit; use a tolerance wherever floating-point
accumulation order can differ, and size that tolerance to the data — a bound that is
fine for `double` is far too tight for `single`.

## Recovering From a Bad Command

If `gather` fails because an invalid operation was queued, fixing the next line is not
enough — MATLAB retains the full operation history on that variable. Recreate the tall
variable from the datastore so its operation queue starts over, then apply only valid
operations:

```matlab
tt = tall(ds);   % recreate — this resets the operation queue
```

## Quick Checklist

- Queue operations; `gather` once, as late as possible; batch multiple outputs.
- Ensure the `gather` result fits in memory — reduce first (`mean`, `groupsummary`, `head`, `topkrows`); never `gather` a full large array.
- Avoid branching or looping on a tall value — evaluating the condition forces a `gather`.
- Verify a function supports tall before using it; reach for a supported equivalent, not a guess (`topkrows` for top-*k*, not `sort`; `groupsummary`/`splitapply` for per-group work).
- Validate tall output against the in-memory result on the **same** sample: exact (`isequal`) for indexing/selection, a data-appropriate tolerance for reductions and numeric algorithms.
- After a failed `gather`, recreate the tall variable to reset its operation queue.

----

Copyright 2026 The MathWorks, Inc.

----
