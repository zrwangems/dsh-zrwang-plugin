# Specialized blockedImage Workflows

## Writing Data (block-by-block)
Create a writable blockedImage and populate it block by block with `setBlock`:
```matlab
bim = blockedImage(dest, imageSize, blockSize, initVal, Mode="w");
setBlock(bim, [r c], blockdata);        % write one block
setBlock(bim, [r c], blockdata, Level=L); % write at specific level
```
Use this when building an image incrementally outside of `apply()` (e.g., assembling tiles from an external source).

## Coordinate Systems and Spatial Referencing
- **Subscripts** — standard MATLAB indexing into the virtual full image.
- **BlockSub** — index into `SizeInBlocks` (which block). Convert with `sub2blocksub` / `blocksub2sub`.
- **World** — real-world coordinates. Convert with `sub2world` / `world2sub`. Set via `WorldStart` and `WorldEnd` properties.

For geospatial coordinate conversions (projected/geographic to pixel), see `blocked-geospatial.md`.

### Multiresolution spatial referencing
blockedImage assumes all resolution levels span the **same world extents**. By default, `WorldStart` and `WorldEnd` are set from the finest level's pixel coordinates (center of first pixel at 0.5, last edge at `Size + 0.5`).

**Verify the assumption:** check that the aspect ratio (`Size(:,1)./Size(:,2)`) is consistent across levels. If it varies, the default referencing is incorrect and levels will not align when displayed side-by-side.

**Fix misaligned levels:** extract pixel spacing from the source metadata. Two common patterns:

1. **TIFF XResolution/YResolution** (pixels per unit, most common for WSI):
   ```matlab
   fileInfo = imfinfo(bim.Source);
   pixelExtent = 1 / fileInfo(1).XResolution;  % world units per pixel at finest level
   imageSizeInWorld = bim.Size(1,1:2) * pixelExtent;
   bim.WorldStart = [pixelExtent/2, pixelExtent/2, 0.5];
   bim.WorldEnd = bim.WorldStart + [imageSizeInWorld, 3];
   ```

2. **DICOM_PIXEL_SPACING in ImageDescription** (embedded XML, e.g., Camelyon data):
   ```matlab
   binfo = imfinfo(bim.Source);
   desc = binfo(1).ImageDescription;
   % Parse pixel spacing per level from XML, then:
   pixelDims = pixelSpacing_coarse / pixelSpacing_fine;
   bim.WorldEnd(coarseLevel, 1:2) = bim.Size(coarseLevel, 1:2) * pixelDims;
   ```

**Verify alignment** after setting world coordinates by displaying two levels side-by-side with `linkviewers` and zooming to a common feature.

## Mask-based Block Selection with `selectBlockLocations`
Build a mask from a coarse level (fits in memory), wrap it as a blockedImage with matching spatial referencing, then use `selectBlockLocations` to select only blocks overlapping the ROI:
```matlab
imCoarse = gather(bim, Level=bim.NumLevels);
BW = ~imbinarize(im2gray(imCoarse));
bmask = blockedImage(BW, WorldEnd=bim.WorldEnd(bim.NumLevels, 1:2));
bls = selectBlockLocations(bim, Mask=bmask, InclusionThreshold=0);
bResult = apply(bim, @fcn, BlockLocationSet=bls);
```
- `InclusionThreshold` (0-1) controls what fraction of mask pixels must be true for a block to be processed. Use `0` to include any block with at least one true pixel.
- **Smaller blocks follow contours better.** Decreasing `BlockSize` in `selectBlockLocations` creates a tighter wrap around the ROI and processes fewer pixels outside it. But if blocks are too small, per-block overhead dominates. Tune by benchmarking.

## ExtraImages for Pixel-level Masking
Pass a second blockedImage (e.g., a mask) via `ExtraImages` to access it in the block function alongside the primary image:
```matlab
bResult = apply(bim, @(bsImg, bsMask) maskAndProcess(bsImg, bsMask), ...
    ExtraImages=bmask, BlockLocationSet=bls);
```
If the extra image has a different resolution than the primary, `apply` delivers blocks covering the same world region — resize inside the function if pixel sizes differ:
```matlab
function bout = maskAndProcess(bsImg, bsMask)
    if ~isequal(size(bsMask), size(bsImg.Data, [1 2]))
        bsMask = imresize(bsMask, size(bsImg.Data, [1 2]), 'nearest');
    end
    bout = bsImg.Data .* cast(bsMask, class(bsImg.Data));
end
```

## In-place Apply with Resume
Write results back to the source location for incremental updates. Use H5Blocks with `ResumeWillOverwrite=true`:
```matlab
h5a = images.blocked.H5Blocks; h5a.ResumeWillOverwrite = true;
bim = apply(bim, @fcn, OutputLocation=bim.Source, Adapter=h5a, Resume=true);
```

----

Copyright 2026 The MathWorks, Inc.
