# Geospatial Blocked Images

blockedImage works with GeoTIFF and other geospatial formats. For general coordinate system and spatial referencing concepts (subscripts, block subscripts, world coordinates, multiresolution alignment), see `blocked-specialized-workflows.md`.

## Setup
```matlab
bim = blockedImage("large_geotiff.tif");
geoinfo = georasterinfo(bim.Source);
bimref = geoinfo.RasterReference;
```
`blockedImage` reads GeoTIFF as a normal TIFF. Use `georasterinfo` separately to obtain the `MapCellsReference` or `GeographicCellsReference` object for coordinate conversions.

## Reading a region by projected coordinates
Convert map/geographic coordinates to pixel coordinates, then use `getRegion`:
```matlab
projylims = [2954280, 2954623];
projxlims = [773345, 773879];
[pixelStartYX, pixelEndYX] = worldWindowToDiscreteWindow(bimref, projylims, projxlims);
region = getRegion(bim, [pixelStartYX 1], [pixelEndYX 3]);
```

## Getting georef for a block
When processing blocks in `apply()`, compute the per-block map/geo reference from block metadata:
```matlab
[block, blockInfo] = getBlock(bim, [7 3 1]);
blockRef = cropMapGeoRef(bimref, blockInfo.Start, blockInfo.End);
mapshow(block, blockRef)
```
Inside an `apply` function, use `bs.Start` and `bs.End` the same way.

## Crop and mask with shapefiles
1. Load the shapefile: `shapes = shaperead('hydro_area.shp');`
2. Get bounding box in world coordinates from `shapes(k).BoundingBox`
3. Convert to pixel coordinates with `worldWindowToDiscreteWindow`
4. **Zero-copy crop:** `bimcrop = crop(bim, pixelStart, pixelEnd);` — instant, no data copied
5. Compute cropped reference: `cropRef = cropMapGeoRef(bimref, pixelStart, pixelEnd);`

### Vector to raster mask
Convert shapefile polygon vertices to pixel coordinates, then create a blockedImage mask:
```matlab
[polyy, polyx] = worldToDiscrete(bimref, shape.X, shape.Y);
bmask = polyToBlockedImage({[polyx' polyy']}, true, bimcrop.Size(1:2), ...
    WorldStart=bimcrop.WorldStart, WorldEnd=bimcrop.WorldEnd);
```
Use the mask with `selectBlockLocations` and `ExtraImages` to process only the masked region with pixel-level masking. See `blocked-specialized-workflows.md` for the full `selectBlockLocations` + `ExtraImages` patterns (including `InclusionThreshold` tuning and resolution mismatch handling).
```matlab
bls = selectBlockLocations(bimcrop, BlockSize=[512 512], ...
    Mask=bmask, InclusionThreshold=0);
bResult = apply(bimcrop, @maskAndProcess, ExtraImages=bmask, BlockLocationSet=bls);
```

## Export with geospatial metadata
When writing processed output, preserve GeoTIFF tags. Note that the TIFF adapter does not automatically carry GeoTIFF tags — these must be inserted separately after writing (e.g., with `geotiffwrite` or by copying tags from the source).

## Multi-resolution pyramids for GeoTIFF
Create a pyramid for efficient visualization:
```matlab
bim = makeMultiLevel2D(bim, Scales=[1 1/8], Adapter=images.blocked.TIFF);
```
For parallel processing, use H5Blocks first (supports parallel writes), then convert to TIFF:
```matlab
bResult = apply(bim, @fcn, UseParallel=true, OutputLocation=outDir, Adapter=images.blocked.H5Blocks);
write(bResult, "output.tif", Adapter=images.blocked.TIFF, BlockSize=[512 512]);
```

----

Copyright 2026 The MathWorks, Inc.
