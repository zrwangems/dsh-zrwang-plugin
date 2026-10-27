# Whole Slide Images (WSI) with OpenSlide and Bio-Formats

Whole slide images are high-resolution digital images of microscope slides used in digital pathology. They come in proprietary formats, are very large, and typically contain multiresolution image pyramids, associated images (thumbnails, macro images), and rich metadata.

The **Medical Imaging Toolbox Interface for Whole Slide Imaging File Reader** support package reads WSI files using the OpenSlide and Bio-Formats libraries and returns `blockedImage` objects. Install from Add-On Explorer.

## Choosing Between OpenSlide and Bio-Formats

| Aspect | OpenSlide | Bio-Formats |
|--------|-----------|-------------|
| **Functions** | `openslideinfo`, `openslideread` | `bioformatsinfo`, `bioformatsread` |
| **Formats** | Aperio (.svs), Hamamatsu (.vms, .ndpi), Leica (.scn), ZEISS (.czi), and others | 100+ formats (includes most OpenSlide formats) |
| **Image content** | 2-D, 8-bit RGB, multiple resolution levels, single time point | Also supports 3-D Z-stacks, multichannel fluorescence, time-lapse, multiseries |
| **When to use** | Simple, fast interface for standard 2-D digital pathology images | More complex/flexible; needed for 3-D, multichannel, time-lapse, or multiseries data |

If both libraries support your data, consider which is more commonly used in your field. Reading the same file with both can yield different results depending on format.

## Import Metadata and Image Data

```matlab
% Read metadata
info = openslideinfo(filename);
info.AssociatedImages  % e.g., "macro", "thumbnail"

% Read main image data as blockedImage
bim = openslideread(filename);

% Read associated images (macro, thumbnail)
macroIm = openslideread(filename, ImageType="macro");
```

For Bio-Formats:
```matlab
info = bioformatsinfo(filename);
bim = bioformatsread(filename);
```

## Display and Explore

```matlab
imageshow(bim);  % auto-selects resolution level, smooth zoom/pan
```

`imageshow` picks the resolution level based on zoom and changes levels as you zoom in/out. Supports scale bars, distance measurements, and annotation shapes via `viewer2d`.

## Downstream Processing

After importing as `blockedImage`, use standard blockedImage workflows:
- **Extract regions**: `getBlock`, `getRegion`, `gather` (with `Level` for specific resolution)
- **Blockwise processing**: `apply(bim, @fcn)` with parallel support
- **Nucleus/cell segmentation**: `cellpose` / `segmentCells2D` (see "Detect Nuclei in Large Whole Slide Images Using Cellpose" example)
- **Classification**: extract blocks via `blockedImageDatastore`, train classifiers on block features (see "Classify Tumors in Digital Pathology Images Using Cell Nucleus Morphology" example)
- **Mask-based block selection**: use `selectBlockLocations` with tissue masks to skip background blocks

## Key Examples (MATLAB Documentation)
- **Detect Nuclei in Large Whole Slide Images Using Cellpose** — Cellpose-based nucleus segmentation on WSI
- **Classify Tumors in Digital Pathology Images Using Cell Nucleus Morphology** — block-level classification workflow
- **Read Whole-Slide Images with OpenSlide** — basic import and display

----

Copyright 2026 The MathWorks, Inc.
