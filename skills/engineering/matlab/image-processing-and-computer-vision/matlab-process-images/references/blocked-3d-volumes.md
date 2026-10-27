# 3D Blocked Images

> **If the `matlab-display-image` skill is available, load it for full volshow/viewer3d guidance.** This file covers blockedImage-specific 3D patterns only.

blockedImage supports 3D volumes (e.g., MRI, CT, microscopy stacks). Load a volume directly:
```matlab
bim = blockedImage(vol);  % vol is a 3D or 4D numeric array
```

For single-file multi-page TIFF stacks, use a custom adapter with `tiffreadVolume` and `PixelRegion` for efficient sub-volume random access without loading the entire file. See the "Reference adapter: single multi-page TIFF volume via `tiffreadVolume`" section in `blocked-data-discovery.md`.

## 3D Visualization with `volshow`

`volshow` natively accepts blockedImage objects for efficient out-of-core 3D rendering. Parent it to a `viewer3d` for full camera and lighting control.

### Intensity normalization — CRITICAL for non-uint8 data
`volshow` maps data to colormap/alphamap assuming the range [0, 1] for floating-point or [0, 255] for uint8. If data has a different range (common with single/double scientific data), the display will appear as a solid white or black cube. **Always normalize before displaying:**
```matlab
vol = gather(bim);
lo = 0;
hi = double(prctile(vol(:), 99.5));  % clip outliers
volNorm = max(0, min(1, (double(vol) - lo) / (hi - lo)));

viewer = viewer3d(BackgroundColor="black", BackgroundGradient="off");
volshow(volNorm, Parent=viewer);
```
For uint8 data, no normalization is needed.

### Rendering styles
Choose a rendering style based on what the user wants to see:
- `"VolumeRendering"` (default) — semi-transparent density view, good for overall structure. Requires a well-tuned `Alphamap` (see below).
- `"MaximumIntensityProjection"` — projects brightest voxel along each ray. No opacity issues. Best first choice for quick visualization.
- `"MinimumIntensityProjection"` — highlights dark features (e.g., air cavities)
- `"Isosurface"` — surface at a threshold, good for segmentation boundaries
- `"SlicePlanes"` — interactive orthogonal slice planes for browsing inside the volume. Always works regardless of opacity settings.
- `"CinematicRendering"` — photorealistic rendering with global illumination
- `"GradientOpacity"` — emphasizes edges/boundaries
- `"LightScattering"` — simulates subsurface scattering

**Recommended starting point:** Use `"MaximumIntensityProjection"` first (no alphamap tuning needed), then switch to `"VolumeRendering"` with a custom alphamap once you understand the intensity distribution. `"SlicePlanes"` is always reliable for browsing.
```matlab
volshow(volNorm, RenderingStyle="MaximumIntensityProjection", Colormap=hot(256));
```

### Adjusting opacity and colormap
The default `Alphamap` (`"cubic"`) often makes dense data (e.g., tissue volumes where most voxels are nonzero) appear as a solid opaque block. Build a custom alphamap that makes low/mid intensities transparent:
```matlab
alpha = zeros(256, 1);
alpha(77:end) = linspace(0, 0.6, 180)';  % bottom 30% fully transparent, ramp to 60%

viewer = viewer3d(BackgroundColor="black", BackgroundGradient="off");
volshow(volNorm, Parent=viewer, ...
    RenderingStyle="VolumeRendering", ...
    Alphamap=alpha, ...
    Colormap=hot(256));
```
Tune the ramp start (here 77/256 ≈ 30%) and max opacity (here 0.6) based on the data:
- **Dense tissue** (most voxels nonzero): start ramp at 30-50%, max opacity 0.4-0.6
- **Sparse features** (mostly background): start ramp at 5-10%, max opacity 0.8-1.0

`Alphamap` presets: `"cubic"` (default), `"linear"`, `"quadratic"`. Pass a custom 256-element column vector for fine control.

### SlicePlanes for interactive browsing
`"SlicePlanes"` shows three orthogonal cutting planes (axial, coronal, sagittal) that the user can drag interactively. Always works regardless of opacity/intensity issues — use as a fallback when volume rendering looks wrong:
```matlab
viewer = viewer3d;
volshow(volNorm, Parent=viewer, RenderingStyle="SlicePlanes", Colormap=gray(256));
```

### Side-by-side 3D comparison
Use a grid layout with multiple `viewer3d` panels. Use `linkviewers` to synchronize camera rotation/zoom. Normalize all volumes with the **same** intensity window so they are visually comparable:
```matlab
% Compute shared normalization window across all volumes
vol1 = gather(bim1); vol2 = gather(bim2);
hi = max(prctile(vol1(:), 99.5), prctile(vol2(:), 99.5));
norm = @(v) max(0, min(1, double(v) / hi));

fig = uifigure('Position', [100 100 1200 600]);
g = uigridlayout(fig, [1 2]);
v1 = viewer3d(g, BackgroundColor="black", BackgroundGradient="off");
v1.Layout.Column = 1;
v2 = viewer3d(g, BackgroundColor="black", BackgroundGradient="off");
v2.Layout.Column = 2;
volshow(norm(vol1), Parent=v1, RenderingStyle="MaximumIntensityProjection", Colormap=hot(256));
volshow(norm(vol2), Parent=v2, RenderingStyle="MaximumIntensityProjection", Colormap=hot(256));
linkviewers([v1, v2]);
```

### Overlay segmentation on volume
```matlab
volshow(bim, OverlayData=bSegmentation, OverlayRenderingStyle="LabelOverlay");
```
`OverlayRenderingStyle` options: `"LabelOverlay"` (categorical labels), `"VolumeOverlay"` (continuous data), `"GradientOverlay"` (edge-weighted overlay).

### Overview + detail for large 3D volumes
For very large volumes, rendering the full dataset at full resolution is slow or impossible. Use a two-panel layout: a coarse overview for orientation, and a cropped full-resolution detail view for inspection. Link the cameras so rotating one rotates both.

```matlab
% Build a multi-level pyramid (overview generation is one-time cost)
bim.BlockSize = [4096 4096 20];
bimOverview = makeMultiLevel3D(bim, Scales=0.2, OutputLocation=tempname);
bPyramid = concatenateLevels(bim, bimOverview);

% Extract a detail sub-volume (virtual crop, no data copy)
bDetail = crop(bim, [r1 c1 z1], [r2 c2 z2]);

fig = uifigure(Position=[100 100 1400 700]);
g = uigridlayout(fig, [1 2]);

vOv = viewer3d(g, BackgroundColor="black", BackgroundGradient="off");
vOv.Layout.Column = 1;
vDt = viewer3d(g, BackgroundColor="black", BackgroundGradient="off");
vDt.Layout.Column = 2;

% Overview at coarse level, detail at full resolution
volshow(bPyramid, Parent=vOv, RenderingStyle="MaximumIntensityProjection");
volshow(bDetail, Parent=vDt, RenderingStyle="MaximumIntensityProjection");
linkviewers([vOv, vDt]);
```

Key points:
- The overview uses `makeMultiLevel3D` + `concatenateLevels` so `volshow` can pick the coarse level automatically.
- The detail view uses `crop` (virtual, instant) to restrict to a region of interest at full resolution.
- `linkviewers` synchronizes camera rotation and zoom between the two panels.
- For multi-channel data, add `OverlayData` on both panels to keep the overlay consistent.

### Choosing between `sliceViewer` and `volshow`
- Use **`sliceViewer`** when: browsing individual 2D slices, measuring pixel values, the volume fits in memory, 2D inspection is the goal.
- Use **`volshow`** when: 3D spatial context matters (shape, connectivity, depth), comparing structures across volumes, the data is a blockedImage (supports out-of-core), cinematic or publication-quality rendering is needed.
- Both can be used together: `sliceViewer` for detailed 2D inspection, `volshow` for 3D overview.

## Creating 3D overviews and pyramids

For large 3D volumes that don't fit in memory (or are slow to render at full resolution), create a downsampled overview with `makeMultiLevel3D`. Then combine it with the full-resolution data to create a multi-level pyramid for efficient visualization and processing.

### Generate a downsampled overview
```matlab
% Set BlockSize large for fewer, bigger reads during downsampling
bim.BlockSize = [4096 4096 20];

overviewDir = tempname;  % or a folder on a fast SSD
bimOverview = makeMultiLevel3D(bim, Scales=0.2, ...
    OutputLocation=overviewDir, UseParallel=false);
```
- Choose `Scales` so the overview fits in RAM. For an 8k x 6k x 4k volume, scale 0.1 yields ~800 x 600 x 400 (~400 MB for uint16).
- Set `UseParallel=true` with Parallel Computing Toolbox for faster generation.
- Use a **large BlockSize** for overview generation to minimize per-block overhead.

### Load and inspect the overview
```matlab
vOverview = gather(bimOverview);
imageshow(imadjust(vOverview(:,:,1)), Interpolation="bilinear");
```

### Build a multi-level pyramid
Combine the full-resolution blockedImage with the overview into a single multi-level representation:
```matlab
bPyramid = concatenateLevels(bim, bimOverview);
bPyramid.Size  % shows sizes at each level
```
Downstream tools (`volshow`, `imageshow`, `apply`) can then select the appropriate resolution level automatically.

### Write a compressed copy for archival or faster I/O
Convert uncompressed folder-of-TIFFs to a compressed chunked format:
```matlab
h5adapter = images.blocked.H5Blocks;
h5adapter.GZIPLevel = 2;
write(bim, "compressed_output", BlockSize=[1024 1024 1024], Adapter=h5adapter);
```

### Labeling with volumeSegmenter
The `volumeSegmenter` app can work directly with blockedImage, but each loaded block must fit in GPU/display memory. Set BlockSize so each block is at most 2048^3 voxels:
```matlab
bim.BlockSize = [2048 2048 N];  % N = number of Z slices, capped so total <= 2048^3
volumeSegmenter(bim);
```

## 3D inference with `apply()`
```matlab
bSeg = apply(bim, @(bs) semanticseg(bs.Data, net, Classes=classNames), ...
    BlockSize=[132 132 132 4], ...
    BorderSize=[44 44 44 0], ...   % (netInputSize - blockSize)/2
    PadPartialBlocks=true, PadMethod="replicate", ...
    BatchSize=1);
```
- `BorderSize` = `(networkInputSize - networkOutputSize) / 2` — ensures each output pixel has full receptive field context.
- `BatchSize=1` is typical for 3D to avoid GPU OOM; increase cautiously.
- Use `makeMultiLevel3D` to create 3D resolution pyramids.

## 3D training data
Use `randomPatchExtractionDatastore` to extract random 3D patches during training:
```matlab
patchDS = randomPatchExtractionDatastore(bimDS, blabelDS, [132 132 132], PatchesPerImage=16);
```

----

Copyright 2026 The MathWorks, Inc.
