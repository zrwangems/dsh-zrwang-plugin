# Video I/O

Read, process, and write video files using `VideoReader` and `VideoWriter`.

## Reading Video

### Key Gotcha: Memory

`read(v)` loads ALL frames into memory. For large videos, iterate instead:

```matlab
v = VideoReader("clip.mp4");
while hasFrame(v)
    frame = readFrame(v);
    % Process frame...
end
```

For specific frame ranges: `frames = read(v, [10 20]);`

### Frame Counting

Accessing `NumFrames` on MP4 files can be **very slow** — it must scan the entire file (e.g., ~24 s on a 69-minute clip) and blocks MATLAB during the scan.

- **Approximate count (fast):** Use `Duration * FrameRate` when you only need to estimate length, check if a video is "short" or "long", or size a progress bar.
  ```matlab
  v = VideoReader("clip.mp4");
  approxFrames = round(v.Duration * v.FrameRate);
  ```
- **Exact count (slow):** Use `v.NumFrames` only when an exact count is required (e.g., preallocating an array of exactly the right size).
- **Exact count without blocking:** Use `parfeval` with `backgroundPool` to compute the count asynchronously. Note that `fetchOutputs` still blocks until the operation completes.
  ```matlab
  v = VideoReader("clip.mp4");
  f = parfeval(backgroundPool, @(v) v.NumFrames, 1, v);
  % ... do other work ...
  exactCount = fetchOutputs(f);  % blocks here until done
  ```

## Writing Video

### VideoWriter — Always Close

An unclosed `VideoWriter` produces a corrupt file. Use `onCleanup`:

```matlab
vw = VideoWriter("output.mp4", "MPEG-4");
cleanup = onCleanup(@() close(vw));
vw.FrameRate = 30;
vw.Quality = 95;
open(vw);
for i = 1:numFrames
    writeVideo(vw, frames(:,:,:,i));
end
```

### Profiles

| Profile | Extension | Notes |
|---------|-----------|-------|
| `"MPEG-4"` | .mp4 | H.264 compressed, most common |
| `"Motion JPEG AVI"` | .avi | Per-frame JPEG compression |
| `"Motion JPEG 2000"` | .mj2 | Per-frame JPEG 2000, supports >8-bit and lossless |
| `"Archival"` | .mj2 | Lossless Motion JPEG 2000 for archival quality |
| `"Grayscale AVI"` | .avi | Uncompressed grayscale |
| `"Uncompressed AVI"` | .avi | Uncompressed RGB |

### MPEG-4 Frame Dimensions

MPEG-4 (H.264) requires even frame dimensions. **Do not pad or crop frames manually** — `VideoWriter` accepts odd-dimension frame inputs and performs the required padding internally.

### Variable Frame Rate

`VideoWriter` writes **constant frame rate video only**. In a read-process-write workflow on a variable frame rate source, the output will use the writer's `FrameRate` for all frames. The original per-frame timing is **not preserved**, even if you copy the reader's average frame rate to the writer.

## Common Mistakes

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|-----------------|
| `read(v)` on large video | Loads ALL frames into memory | Use `hasFrame`/`readFrame` loop |
| `v.NumFrames` to check if video is long | Blocks MATLAB for tens of seconds on MP4 | Use `v.Duration * v.FrameRate` for approximate count |
| Manual padding for odd-dimension H.264 | Unnecessary extra code and potential artifacts | `VideoWriter` handles padding internally |
| Copying reader `FrameRate` to writer for VFR video | Silently loses original frame timing | Acknowledge constant-rate limitation; document the deviation |
| Forgetting to close `VideoWriter` | Produces corrupt output file | Use `onCleanup(@() close(vw))` |

----

Copyright 2026 The MathWorks, Inc.

----
