# Function: `framesig`

> Used in: wf-frame-and-label.md
> Toolbox: Signal Processing Toolbox

Break a long signal into overlapping frames. Replaces the manual
`(i-1)*hopSize+1` indexing loop.

## Signature

```matlab
frames = framesig(x, frameLength)
frames = framesig(x, frameLength, Name=Value, ...)
[frames, fnlcond] = framesig(___)            % final condition for streaming (overlap)
[frames, fnlcond, fnlidx] = framesig(___)    % + final index for streaming (underlap)
```

- `x` — signal vector, matrix (columns are channels), N-D array, timetable, or `dlarray`.
- `frameLength` — samples per frame.

Returns a `frameLength × numFrames` matrix (or 3-D for multi-channel
input). The optional second output `fnlcond` carries trailing samples
forward for streaming.

## Name-value arguments (all 7)

| NV-pair | Default | Purpose |
|---|---|---|
| `Window` | `rectwin(frameLength)` | Vector taper applied to each frame; `length(Window) == frameLength`. |
| `OverlapLength` | `0` | Samples shared between adjacent frames (hop = `frameLength - OverlapLength`). Mutually exclusive with `UnderlapLength`. |
| `UnderlapLength` | `0` | Samples skipped between adjacent frames (lowers frame rate). Mutually exclusive with `OverlapLength`. |
| `InitialCondition` | `[]` | Vector / matrix / N-D / timetable / unformatted `dlarray` prepended to `x` along the framing dimension. The streaming-mode partner of `fnlcond`. |
| `InitialIndex` | `1` | Index of the first sample to start framing from; `InitialIndex - 1` samples at the start of `x` are discarded. |
| `IncompleteFrameRule` | `"drop"` | What to do with the trailing partial frame: `"drop"` discards it, `"zeropad"` pads it to `frameLength`. |
| `Dimension` | first dim of size > 1 | Positive integer scalar selecting which dimension of an N-D `x` to frame along. Not supported for timetable inputs. |

> Setting both `OverlapLength` and `UnderlapLength` is an error — they are
> alternative scheduling modes, not stackable. **Don't pass both names
> even at default values** (e.g. `OverlapLength=0, UnderlapLength=4`
> errors too). Pass at most one. (Same parser as `framelbl`.)

## Canonical pattern

```matlab
% 1024-sample frames, 50% overlap (hop = 512):
frames = framesig(x, 1024, OverlapLength=512);

% With a Hann taper:
frames = framesig(x, 1024, OverlapLength=512, Window=hann(1024));
```

## Anti-pattern

Don't roll your own frame loop. Hand-rolled framing misses streaming
`InitialCondition` semantics and reinvents the function.

```matlab
% Bad — manual indexing:
hopSize = 512;
numFrames = floor((numel(x) - 1024) / hopSize) + 1;
frames = zeros(1024, numFrames);
for i = 1:numFrames
    idx = (i-1)*hopSize + 1;
    frames(:, i) = x(idx : idx+1023);
end

% Good — one call:
frames = framesig(x, 1024, OverlapLength=512);
```

## Gotchas

- **Frame count depends on `numel(x)`, `frameLength`, and `OverlapLength`.**
  Default `IncompleteFrameRule="drop"` rounds down — partial trailing
  frames are dropped silently. Set `IncompleteFrameRule="zeropad"` if you
  need the trailing partial.
- **`OverlapLength`, not `HopSize`.** Hop = `frameLength - OverlapLength`.
- **For multi-channel input**, `x` must be `samples × channels`. Output is
  `frameLength × numFrames × channels`.
- **Streaming pattern (overlap)** uses `InitialCondition` + `fnlcond`:
  capture `fnlcond` from one call, pass it as `InitialCondition` to the
  next call on the next chunk. Same-shape constraint: the initial
  condition must concatenate cleanly along the framing dimension.
- **Streaming pattern (underlap)** also captures `fnlidx` (3rd output) and
  passes it as `InitialIndex` on the next call to preserve the underlap
  cadence across chunks.

## Pairing — `framesig` + `framelbl`

For per-frame supervised learning, frame the signal and the labels in
lockstep. `framesig` produces `frameLength × numFrames`; `framelbl` (with
the same frame parameters) produces a `1 × numFrames` label vector.

See wf-frame-and-label.md for the joint recipe.

## See also

- `fn-framelbl.md` — the label-side counterpart.
- `wf-frame-and-label.md` — joint signal-and-label framing recipe.

----

Copyright 2026 The MathWorks, Inc.

----
