# Training, Labeling, and DL Inference with blockedImage

## Labeling with Image Labeler
The **Image Labeler** app supports blocked images for labeling images too large to fit in memory (any dimension > 8000 px or multiresolution). The app auto-converts to blocked format on import.

- **ROI labels only** — pixel labeling is not supported for blocked images. Use rectangles, rotated rectangles, lines, polygons, projected cuboids.
- **Multiresolution** — the app auto-switches resolution level as you zoom. All levels must be spatially registered.
- **Overview pane** — shows the full image with a box indicating the visible region. Drag the box to navigate.
- **Blocked image automation** — subclass `vision.labeler.mixin.BlockedImageAutomation` and implement `blockedImageAutomationAlgorithm` to auto-label with a trained detector. Supports selecting processing region (whole image / current view / custom ROI), resolution level, block size (default 1024x1024), and `UseParallel`.
- **Export** — labels export as a `groundTruth` object. Convert polygon labels to a labeled blockedImage with `polyToBlockedImage` for semantic segmentation workflows.

## Creating Labeled Blocked Images

### From ROI polygons
Use `polyToBlockedImage` to convert polygon coordinates and label IDs into a labeled blockedImage. Match spatial referencing to the source image:
```matlab
roiPositions = [normalRegions; tumorRegions];  % cell array of Nx2 coords
roiLabelIDs = [ones(nNormal,1,"uint8"); 2*ones(nTumor,1,"uint8")];
maskLevel = 2;  % coarser = faster, finer = more detail
bROILabels = polyToBlockedImage(roiPositions, roiLabelIDs, bim.Size(maskLevel,1:2), ...
    BlockSize=bim.BlockSize(maskLevel,1:2), ...
    WorldStart=bim.WorldStart(maskLevel,1:2), WorldEnd=bim.WorldEnd(maskLevel,1:2));
```
Unlabeled pixels default to 0. Choose resolution level as a tradeoff: coarser is faster/smaller, finer preserves small or freehand ROI detail.

### Combining labels from multiple sources
Use `ExtraImages` in `apply()` to combine a ROI-based label image with a mask-based label image. Images at different resolution levels can be combined if they share the same world extents — `apply` handles resampling:
```matlab
% Tissue mask from thresholding at coarsest level
btissueMask = apply(bim, @(bs) bwmorph(im2gray(bs.Data)<130, "close"), Level=3);

% Combine: ROI labels + tissue mask -> single label image
bLabels = apply(bROILabels, @(bs, mask) combineLabels(bs, mask), ExtraImages=btissueMask);
```
In the user function, `imresize` the extra image block to match the primary block size when they differ in resolution.

### Display labeled overlay
```matlab
imageshow(bim, OverlayData=bLabels, ...
    OverlayColormap=[0 0 1; 0 1 0; 1 0 0], ...  % background, normal, tumor
    OverlayDisplayRangeMode="data-range", ...
    OverlayAlphamap=[0.6 0.6 0.6]);
```

## Training Data
Use `blockedImageDatastore` to create a datastore of blocks for DL training:
```matlab
bimds = blockedImageDatastore(bims, BlockSize=[256 256 3]);
```
Use `selectBlockLocations` with `Masks` to select only blocks containing tissue/objects, and pass the result as `BlockLocationSet`.

### Creating blockedImages from non-standard formats
Use `FileSet` + custom adapter to load collections of non-standard files (e.g., DICOM) as a blockedImage array:
```matlab
fs = matlab.io.datastore.FileSet(fullfile(dataDir, "*.dcm"));
bims = blockedImage(fs, Adapter=DICOMAdapter);
```
For formats without partial IO (like DICOM), set `IOBlockSize = info.Size` — the full image is the smallest readable unit.

### Categorical/label data in adapters
For semantic segmentation labels, adapters can return `categorical` data directly:
```matlab
info.Datatype = "categorical";
info.InitialValue = categorical(NaN, [0 1], ["Background", "Tumor"]);
% In getIOBlock:
rawMask = imread(labelFile);
data = categorical(logical(rawMask), [0 1], ["Background", "Tumor"]);
```
This integrates directly with `semanticseg` and DL training workflows.

### Class balancing with over/under sampling
`BlockOffsets` controls the stride between consecutive blocks. Adjust it relative to `BlockSize` to over- or under-sample:
- **Oversampling** (overlapping blocks): `BlockOffsets = round(blockSize * 0.5)` — 50% overlap, doubles patch count
- **Undersampling** (gaps between blocks): `BlockOffsets = blockSize + round(blockSize * 1.0)` — one block-width gap, halves patch count
- **Default** (abutting): `BlockOffsets = blockSize` — no overlap, no gap

Combine with masks to over-sample rare classes and under-sample common ones, then merge:
```matlab
% Over-sample tumor regions with 50% overlap
blsTumor = selectBlockLocations(bims, BlockSize=blockSize, ...
    BlockOffsets=round(blockSize*0.5), Masks=tumorMask, InclusionThreshold=0.6);

% Under-sample background with 1.2x spacing
blsBG = selectBlockLocations(bims, BlockSize=blockSize, ...
    BlockOffsets=blockSize + round(blockSize*1.2), Masks=bgMask, InclusionThreshold=0.9);

% Merge into one balanced set
bls = mergeBlockLocationSets(blsTumor, bims, blsBG, bims);
```
Tune overlap percentages and inclusion thresholds to roughly equalize the block count across classes. Use `numel(bls.ImageNumber)` to check counts.

### Paired image + label datastores
Create corresponding datastores for images and labels using the same block location set, then combine for training:
```matlab
blockds = blockedImageDatastore(bims, BlockLocationSet=bls);
labelds = blockedImageDatastore(blabels, BlockLocationSet=bls);
trainingds = combine(blockds, labelds);
trainingds = shuffle(trainingds);
```
The label blockedImages must cover the same world extent as the image blockedImages. `blockedImageDatastore` ensures spatially corresponding blocks are paired.

### Augmentation and labeling with `transform()`
Wrap the datastore with `transform()` to add labels and augmentations:
```matlab
bimds = blockedImageDatastore(bims, BlockLocationSet=bls);
trainDS = transform(bimds, @(bs) addLabelAndAugment(bs));
```
In the transform function, assign labels based on mask overlap and apply augmentations (flips, 90-degree rotations).

### Train/validation split
Use `subset()` to split block location sets:
```matlab
trainDS = subset(bimds, trainIdx);
valDS   = subset(bimds, valIdx);
```

### Performance tip
`shuffle()` breaks the blockedImage cache and hurts repeated read performance. For repeated training runs with hyperparameter tuning, export once with `writeall()` to JPEG/PNG, then use `imageDatastore` for all training runs.

## DL Inference on Blocked Images
Use `apply()` with `BatchSize` to run inference efficiently on full-resolution images:
```matlab
bPred = apply(bim, @(bs) predict(net, bs.Data), ...
    BlockLocationSet=bls, BlockSize=[256 256 3], ...
    BorderSize=[16 16], BatchSize=128, UseParallel=true);
```
- **BatchSize** — number of blocks per GPU batch. Increase for throughput, decrease if GPU OOM.
- Store prediction heatmaps as a new blockedImage for downstream thresholding/visualization.
- For 3D inference, set `PadPartialBlocks=true` and `PadMethod="replicate"` to handle incomplete edge blocks.

----

Copyright 2026 The MathWorks, Inc.
