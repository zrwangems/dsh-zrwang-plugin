# Data Discovery and Custom Adapters

Before writing any adapter code, run through these steps to understand the user's data:

## Step 1: Data layout
Ask the user:
- Is the data a **single large file** or a **folder of files**? (folder is more common)
- Ask for a sample directory listing or file path

## Step 2: File naming convention (folder of files)
Get a sample `ls`/`dir` listing and identify which parts of the filename encode:
- Slice/Z index (e.g., `_Z1`, `_Z2`)
- Channel (e.g., `_C1`, `_C2`)
- Tile/block coordinates (e.g., `_Y1_Z1`, `_row3_col5`)
- View/modality (e.g., `_SPIMA`, `_SPIMB`)

Parse the naming pattern to determine the grid dimensions and axis order. Ask the user to confirm what each part means.

## Step 3: Inspect sample files automatically
Run `imfinfo` (or `h5info`/`ncinfo` for non-image formats) on a few sample files to extract:
- Image size (Height, Width)
- Data type (BitDepth, ColorType -> MATLAB class)
- Compression method
- Tile size if tiled TIFF (TileWidth, TileLength)
- Samples per pixel
- **ImageJ hyperstack check:** If `ImageDescription` contains `'ImageJ'`, the file is a multi-slice stack stored as raw data after a single IFD. Parse `images=N` and `spacing=S` from the description. The true volume size is `[Height, Width, N]`. See the "ImageJ Hyperstack TIFFs" section below for the read pattern. Compare file size vs. `Height * Width * BytesPerSample` — a large mismatch confirms hidden slices.

Confirm findings with the user. Only ask what can't be inferred: what each filename dimension represents, which dimension varies fastest on disk.

## Step 4: Understand intent
Ask what the user plans to do: visualization, processing, archival, or DL training.
- **3D data (Z-stacks, slices, volumes):** If the data has a Z/depth/slice dimension, treat it as a 3D volume. For visualization, default to `volshow` + `viewer3d` (see `blocked-3d-volumes.md`), not 2D slice-by-slice viewers. For multi-channel overlay, use `OverlayData` with `volshow`.
- **Archival** + uncompressed data (check `imfinfo` Compression) -> suggest format conversion with compression (JPEG > PNG > H5Blocks)
- **Visualization only** -> may not need a custom adapter if data can be pre-converted
- **Processing** -> align IOBlockSize with expected processing block size
- **Dimension ordering** -> for N-D data with multiple valid orderings, ask the user what their dominant access pattern is (e.g., browsing XY planes vs. processing depth columns) if it's not clear from their stated intent. See "Dimension ordering for N-D adapters" in the adapter section below.

## Step 5: Assess random access
Determine `IOBlockSize` based on data format:
- **Folder of uncompressed/stripped TIFFs** -> `imread` with `PixelRegion` supports sub-image reads. Set `IOBlockSize` to a sub-slice region (e.g., `[4096, 4096, 1]`) rather than the full file dimensions. This enables partial reads without loading entire slices.
- **Single multi-page TIFF volume** -> `tiffreadVolume` with `PixelRegion` supports sub-volume reads along rows, columns, and slices. Set `IOBlockSize` to a 3D chunk (e.g., `[4096, 4096, 16]`). The `PixelRegion` syntax is `{[rowStart rowEnd], [colStart colEnd], [sliceStart sliceEnd]}` with optional stride `[start stride end]`. This is the preferred read function for custom adapters wrapping single-file 3D TIFF stacks (IFD-per-slice or ImageDepth-based).
- **Folder of compressed files (JPEG, PNG, etc.)** -> each file is one IO block (no sub-image random access). `IOBlockSize` = single file's image dimensions.
- **Single tiled TIFF** -> `IOBlockSize` = tile size from `imfinfo` (TileWidth, TileLength)
- **Single stripped TIFF** -> `IOBlockSize` = strip size (RowsPerStrip x Width)
- **Single HDF5** -> `IOBlockSize` = chunk size from `h5info`
- **Compressed blob, no random access** -> recommend converting to chunked format first (JPEG > PNG > H5Blocks)

## Step 6: Check spatial coverage (folder of files)
Ask: do the tiles/slices perfectly abut (no gaps, no overlaps)?
- **Gaps** (missing files/empty regions): default fill value to 0. Ask if a different value is appropriate. Expose as a `FillValue` property on the custom adapter so the user can change it.
- **Overlaps or irregular grid**: warn the user that blockedImage assumes a regular non-overlapping grid. Irregular layouts need stitching/registration before they can be exposed as a single blockedImage.

## Step 7: Recommend approach
Based on the above, recommend one of:
1. **Built-in adapter works** — no custom code needed, construct blockedImage directly
2. **Format conversion first** — convert to a better format with `write()`, then use built-in adapter
3. **Custom adapter needed** — proceed to write one using the info below

---

## ImageJ Hyperstack TIFFs

ImageJ saves 3-D+ stacks as single-IFD TIFFs: one TIFF directory describes the first 2-D slice, and all remaining slices are appended as raw pixel data after the first strip. `imfinfo` reports only one page, but the `ImageDescription` tag encodes the true slice count and spacing:

```
ImageJ=1.52i
images=1300
slices=1300
spacing=2.0009
```

### Detection
Check for an ImageJ hyperstack: `contains(imfinfo(f).ImageDescription, 'ImageJ')`. Parse `images=N` from the description to get the slice count.

### Reading arbitrary slices via fread
`imread` only returns the first slice. To read slice `k` (1-based):
```matlab
t = Tiff(filePath, 'r');
stripOffset = t.getTag('StripOffsets');
t.close();

% Detect byte order from TIFF header
fid = fopen(filePath, 'r');
byteOrder = fread(fid, 2, '*char')';
fclose(fid);
machineFormat = 'l';  % default little-endian
if strcmp(byteOrder, 'MM')
    machineFormat = 'b';  % big-endian
end

bytesPerSlice = width * height * bytesPerSample;
fid = fopen(filePath, 'r', machineFormat);
fseek(fid, stripOffset + (k-1) * bytesPerSlice, 'bof');
slice = fread(fid, [width, height], '*uint16')';
fclose(fid);
```

### Key pitfalls
- **Byte order varies.** ImageJ TIFFs can be big-endian (`MM`) or little-endian (`II`). Always read the first two bytes of the file to determine this — do not assume little-endian.
- **Strip offset varies across files.** The `StripOffsets` tag is not constant when ImageDescription length differs between files (e.g., different `min`/`max` values). Cache each file's strip offset during `openToRead` rather than hardcoding a single value.
- **fread dimension order.** `fread` fills column-major. For row-major pixel order (standard TIFF), read as `fread(fid, [width, height], ...)` then transpose with `'`.

### Custom adapter pattern for ImageJ hyperstack folders
When a folder contains multiple ImageJ hyperstack TIFFs forming a tiled/multi-channel dataset, each file contributes one spatial tile or channel. The adapter maps `(tile, slice, channel)` to a file + byte offset:
```matlab
function block = getIOBlock(obj, ioBlockSub, level)
    key = buildKeyFromSub(ioBlockSub);  % map sub to filename
    entry = obj.FileMap(key);           % cached path + stripOffset
    offset = entry.StripOffset + (sliceIdx - 1) * obj.BytesPerSlice;
    fid = fopen(entry.Path, 'r', obj.MachineFormat);
    fseek(fid, offset, 'bof');
    block = fread(fid, [obj.TileWidth, obj.TileHeight], '*uint16')';
    fclose(fid);
end
```

---

## Writing Custom Adapters
Subclass `images.blocked.Adapter` to support new file formats or data sources.

### Required methods (read)
| Method | Purpose |
|--------|---------|
| `openToRead(obj, source)` | Open the data source for reading |
| `getInfo(obj)` | Return an `info` struct (see below) |
| `getIOBlock(obj, ioBlockSub, level)` | Read one IO block by its subscript and level |
| `close(obj)` | Release resources |

### Optional methods (write)
| Method | Purpose |
|--------|---------|
| `openToWrite(obj, destination, info, level)` | Create and open destination for writing |
| `setIOBlock(obj, ioBlockSub, level, data)` | Write one IO block |

### The `info` struct
`getInfo` must return a struct with these fields:
- `Size` — L-by-N matrix of image size at each level
- `IOBlockSize` — L-by-N matrix of native read/write block size at each level
- `Datatype` — 1-by-L string array of MATLAB class names (e.g., `"uint8"`)
- `InitialValue` — default value for unwritten blocks (e.g., `cast(0, info.Datatype(1))`)

### IOBlockSize guidelines
- **Too small** (e.g., single pixel from a binary file): combine reads in the adapter to present a larger logical block. Reduces per-block overhead.
- **Too large** (e.g., entire compressed blob): use a library that supports random access within the compressed stream (e.g., JP2K).
- **Neither works**: convert the data to a chunked format with `write()` using the adapter preference below (JPEG > PNG > H5Blocks). Choose a block size matching your downstream workflow.

### Dimension ordering for N-D adapters
When the data has more than 3 dimensions (e.g., spatial Y, spatial X, depth slices, channels), the choice of which dimension maps to which `Size` index affects access patterns:
- **Put the dimension that varies per-file first if it's the one you iterate over.** For depth-slice-per-file data, putting depth as dim 1 (`Size = [nSlices, H*nTilesY, W*nTilesZ, nC]`) means `BlockSize` can batch consecutive slices for efficient sequential reads.
- **Put spatial dims first (rows, cols) if visualization or 2-D spatial processing dominates.** This is more natural for `imageshow`/`getRegion` workflows operating on XY planes.
- Either ordering works — `apply()` iterates over blocks regardless. Choose based on the dominant access pattern.
- **If the best ordering is unclear from context, ask the user.** For example: "Your data has spatial tiles and depth slices — do you primarily want to browse XY planes at different depths (spatial dims first), or process depth strips across tiles (depth first)? This affects which operations are fastest."

### Reference adapter: folder of 2D TIFF slices as a 3D volume

A common pattern in microscopy/micro-CT is one uncompressed TIFF file per Z slice. The adapter maps each Z index to a filename, and uses `imread` with `PixelRegion` for sub-slice random access:

```matlab
classdef TIFFFolderAdapter < images.blocked.Adapter
    properties
        CommonPrefix (1,1) string   % filename prefix, e.g. "het1a_c1_"
        StartIndex (1,1) double = 1 % first slice number in filenames
        IndexFormat (1,1) string = "%05d" % sprintf format for slice number
    end
    properties (Access = private)
        Folder (1,1) string
        Info (1,1) struct
    end
    methods
        function openToRead(obj, folder)
            arguments
                obj
                folder (1,1) string {mustBeFolder}
            end
            obj.Folder = folder;
        end

        function info = getInfo(obj)
            fileList = dir(fullfile(obj.Folder, obj.CommonPrefix + "*.tif"));
            sliceInfo = imfinfo(fullfile(obj.Folder, fileList(1).name));
            numberOfSlices = numel(fileList);

            % Determine StartIndex from first filename
            tok = regexp(fileList(1).name, obj.CommonPrefix + '(\d+)\.tif', 'tokens');
            obj.StartIndex = str2double(tok{1}{1});

            obj.Info.Size = [sliceInfo(1).Height, sliceInfo(1).Width, numberOfSlices];
            % Sub-slice IOBlockSize for partial reads. Keep XY large enough
            % to reduce overhead but small enough to fit in memory as 3D chunks.
            obj.Info.IOBlockSize = [4096, 4096, 1];
            obj.Info.Datatype = "uint16";
            obj.Info.InitialValue = cast(0, obj.Info.Datatype);
            info = obj.Info;
        end

        function block = getIOBlock(obj, ioblockSub, level)
            assert(level == 1);
            regionStart = (ioblockSub - 1) .* obj.Info.IOBlockSize + 1;
            regionEnd   = ioblockSub .* obj.Info.IOBlockSize;
            rows = [regionStart(1), regionEnd(1)];
            cols = [regionStart(2), regionEnd(2)];

            % Map Z block index to filename
            sliceNum = obj.StartIndex + regionStart(3) - 1;
            sliceStr = sprintf(obj.IndexFormat, sliceNum);
            fileName = fullfile(obj.Folder, obj.CommonPrefix + sliceStr + ".tif");
            block = imread(fileName, 'PixelRegion', {rows, cols});
        end
    end
end
```

**Key design choices:**
- `IOBlockSize` is `[4096, 4096, 1]` — sub-slice for XY partial reads, one slice thick in Z. For stripped TIFFs, `imread` with `PixelRegion` provides efficient sub-image reads without loading the full slice.
- `StartIndex` is auto-detected from the first filename (slice numbers often don't start at 1, e.g. 02079–02086).
- `IndexFormat` controls zero-padding (default `"%05d"` for 5-digit indices).
- `CommonPrefix` is the filename prefix before the slice number (e.g. `"het1a_c1_"` for files like `het1a_c1_02079.tif`).

**Usage:**
```matlab
adapter = TIFFFolderAdapter;
adapter.CommonPrefix = "het1a_c1_";
bim = blockedImage("/path/to/folder", Adapter=adapter);
```

After construction, `bim.BlockSize` defaults to a multiple of `IOBlockSize`. Override it depending on the workflow:
- **Quick browsing:** `bim.BlockSize = [512 512 4]` (small, fast reads)
- **Overview generation:** `bim.BlockSize = [4096 4096 20]` (large, fewer blocks)
- **Labeling with volumeSegmenter:** `bim.BlockSize = [2048 2048 N]` where N is limited by the app's 2048^3 voxel cap

### Reference adapter: single multi-page TIFF volume via `tiffreadVolume`

When data is a single multi-page TIFF file storing a 3D volume (one IFD per slice, or using the TIFF ImageDepth tag), use `tiffreadVolume` with `PixelRegion` for efficient sub-volume random access:

```matlab
classdef TIFFVolumeAdapter < images.blocked.Adapter
    properties (Access = private)
        FilePath (1,1) string
        Info (1,1) struct
    end
    methods
        function openToRead(obj, source)
            obj.FilePath = source;
        end

        function info = getInfo(obj)
            % Read full volume metadata without loading pixel data
            vInfo = imfinfo(obj.FilePath);
            height = vInfo(1).Height;
            width = vInfo(1).Width;
            numSlices = numel(vInfo);

            obj.Info.Size = [height, width, numSlices];
            obj.Info.IOBlockSize = [4096, 4096, 16];
            obj.Info.Datatype = "uint16";
            obj.Info.InitialValue = cast(0, obj.Info.Datatype);
            info = obj.Info;
        end

        function block = getIOBlock(obj, ioBlockSub, level)
            assert(level == 1);
            regionStart = (ioBlockSub - 1) .* obj.Info.IOBlockSize + 1;
            regionEnd   = min(ioBlockSub .* obj.Info.IOBlockSize, obj.Info.Size);
            block = tiffreadVolume(obj.FilePath, PixelRegion={ ...
                [regionStart(1), regionEnd(1)], ...
                [regionStart(2), regionEnd(2)], ...
                [regionStart(3), regionEnd(3)]});
        end
    end
end
```

**Key design choices:**
- `tiffreadVolume` with `PixelRegion` reads an arbitrary sub-volume without loading the full file. Each element of the cell array is `[start stop]` or `[start stride stop]`, where `inf` means "to the end." This enables true 3D random access from a single TIFF file.
- `IOBlockSize` is `[4096, 4096, 16]` — sub-slice in XY, 16 slices thick in Z. Tune Z extent based on memory and processing needs.
- Supports multi-page TIFFs (one IFD per slice), ImageDepth-based TIFFs, and large (>4 GB) non-BigTIFF files created by ImageJ.

**Usage:**
```matlab
bim = blockedImage("volume.tif", Adapter=TIFFVolumeAdapter);
```

### Reference adapter: multi-IFD TIFF with interleaved channels

When a single TIFF file stores a 3D volume with C channels interleaved across IFDs (e.g., IFD 1 = Z1/C1, IFD 2 = Z1/C2, IFD 3 = Z1/C3, IFD 4 = Z2/C1, ...), map `(z, channel)` → IFD index:
```matlab
function data = getIOBlock(obj, ioBlockSub, level)
    zInd = ioBlockSub(3);
    colorInd = ioBlockSub(4);
    ifdNum = (zInd - 1) * obj.NumChannels + (colorInd - 1) + 1;
    data = imread(obj.Source, Index=ifdNum, Info=obj.CachedTIFFInfo);
end
```
Cache `imfinfo` once in `openToRead` — it parses all IFDs, which is expensive but only needs to happen once. Pass the cached struct to `imread` via the `Info` parameter to skip re-parsing on every read.

### Reference adapter: no partial IO (DICOM, single compressed file)
When the format doesn't support partial reads, set `IOBlockSize = info.Size` so each IO block is the full image:
```matlab
function info = getInfo(obj)
    dinfo = dicominfo(obj.File);
    info.Size = [dinfo.Height, dinfo.Width];
    info.IOBlockSize = info.Size;  % no partial IO
    info.Datatype = "uint16";
    info.InitialValue = uint16(0);
end
function block = getIOBlock(obj, ~, ~)
    block = dicomread(obj.File);
end
```
This still enables `apply()`, `getRegion()`, and `blockedImageDatastore` — blockedImage handles the sub-blocking internally.

### Reference adapter: tile mosaic with overlap cropping
When mosaic tiles overlap, crop each tile to its center region to remove overlap. Compute the crop window from known tile size and desired non-overlapping size:
```matlab
function data = getIOBlock(obj, ioBlockSub, ~)
    tile = imread(buildTilePath(ioBlockSub));
    cropWin = centerCropWindow2d(size(tile), obj.CropSize);
    data = imcrop(tile, cropWin);
end
```
Set `info.IOBlockSize = cropSize` (the post-crop dimensions) and `info.Size = cropSize .* [numTilesY, numTilesX]`.

### Bridging external libraries (Zarr, OpenSlide, etc.)
Custom adapters can wrap external libraries to provide blockedImage access to non-MATLAB formats:
- **Python via `py.*`:** e.g., `py.zarr.open` for Zarr arrays. Read/write through `py.numpy.array` conversion. Set up `pyenv` on all workers for parallel execution.
- **C/C++ via `clibgen`:** e.g., OpenSlide for whole-slide images (.svs, .mrxs). Build a MATLAB interface with `clibgen.generateLibraryDefinition`, then implement `getIOBlock` using the library's region-read function. Multi-level support maps directly to `info.Size` being L-by-N.
- **Key consideration:** if the library supports multi-level/pyramid access, expose all levels via `info.Size(level,:)` and dispatch in `getIOBlock(obj, ioBlockSub, level)`.

---

## Adapter Preference for Format Conversion
When converting with `write(bim, destination)`, choose the adapter in this order:
1. **JPEG** (`images.blocked.JPEGBlocks`) — prefer when lossy compression is acceptable. Best compression ratio and speed.
2. **PNG** (`images.blocked.PNGBlocks`) — prefer when lossless compression is required and data is 2-D or RGB uint8/uint16.
3. **H5Blocks** (`images.blocked.H5Blocks`) — use when data type or dimensionality is not supported by JPEG/PNG (e.g., single, int16, >3 channels). Set GZIPLevel 2-3 (reduce to 1 if the user reports slow write performance):
   ```matlab
   adapter = images.blocked.H5Blocks;
   adapter.GZIPLevel = 2;
   write(bim, "output_folder", Adapter=adapter, BlockSize=[512 512 3]);
   ```

**3-D or higher-dimensional data with JPEG/PNG:** If the data can be sliced into 2-D or 2-D RGB planes, design the adapter's `IOBlockSize` to be 2-D (or 2-D with 3 channels) so each IO block is a single slice. This lets you use JPEG/PNG for storage while the blockedImage handles the higher-dimensional blocking. Suggest this to the user as an alternative to H5Blocks when their data permits it.

---

## Virtual Composite Adapters
Custom adapters can wrap existing blockedImages to create virtual views without copying data.

### Virtual RGB from separate channels
When each fluorescence channel is a separate blockedImage, create a composite adapter that maps N channels to RGB:
```matlab
classdef RGBCompositeAdapter < images.blocked.Adapter
    properties
        ChannelImages blockedImage
        RGBChannelMapping (1,3) double = [1 2 3]  % 0 = zero out channel
        BackgroundValue (1,3) double = [0 0 0]
        SaturationValue (1,3) double = [65535 65535 65535]
        ChannelColors double  % 3x3 matrix, row i = RGB color for channel i
    end
    methods
        function obj = RGBCompositeAdapter(bimArray)
            obj.ChannelImages = bimArray;
            obj.ChannelColors = eye(3);
        end
        function openToRead(~, ~), end
        function info = getInfo(obj)
            info = obj.ChannelImages(1).Adapter.getInfo();
            info.Size(:,3) = 3;
            info.IOBlockSize(:,3) = 3;
        end
        function data = getIOBlock(obj, ioBlockSub, level)
            ioBlockSub(3) = [];  % channel dim is always 1 in composite
            data = zeros([obj.ChannelImages(1).IOBlockSize(1:2) 3]);
            for c = 1:3
                idx = obj.RGBChannelMapping(c);
                if idx > 0
                    block = rescale(double(obj.ChannelImages(idx).Adapter.getIOBlock(ioBlockSub, level)), ...
                        0, 1, InputMin=obj.BackgroundValue(c), InputMax=obj.SaturationValue(c));
                    data = data + reshape(obj.ChannelColors(c,:), [1 1 3]) .* block;
                end
            end
            data = im2uint16(data);
        end
    end
end
```
Usage: `bimRGB = blockedImage("Composite", Adapter=RGBCompositeAdapter([bCh1, bCh2, bCh3]));`

To dynamically change the mapping (e.g., swap channels interactively), update adapter properties then call `bimRGB.BlockCache.reset()` and refresh the display.

---

## Performance Tips for Custom Adapters
- **Cache imfinfo for multi-IFD TIFFs.** `imread(file, Index=k, Info=cachedInfo)` avoids re-parsing all IFDs on each read. Cache the `imfinfo` struct per file in `openToRead`, not per `getIOBlock` call:
  ```matlab
  obj.InfoCache(fileName) = imfinfo(fullPath);
  % Later in getIOBlock:
  data = imread(fullPath, Index=ifdNum, Info=obj.InfoCache(fileName));
  ```
- **Graceful error handling.** Microscopy data often has corrupt slices. Return a zero-filled block on read failure rather than crashing `apply`:
  ```matlab
  try
      data = imread(file, Index=k, Info=cached);
  catch
      warning("Corrupt slice %d in %s", k, file);
      data = zeros(obj.Info.IOBlockSize, obj.Info.Datatype);
  end
  ```
- **Writable blockedImage for labeling.** Create a multi-level writable blockedImage, write labels at full resolution with `setBlock`, and simultaneously write a downsampled version at a coarser level for fast overlay visualization:
  ```matlab
  blabs = blockedImage(tempname, [blockSize; coarseBlockSize], ...
      [fullSize; coarseSize], ["uint8","uint8"]);
  blabs.setBlock([r c], labelBlock, Level=1);
  blabs.setBlock([r c], imresize(labelBlock, coarseBlockSize, 'nearest'), Level=2);
  ```

----

Copyright 2026 The MathWorks, Inc.
