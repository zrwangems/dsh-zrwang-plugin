# Visualization Patterns for blockedImage

> **If the `matlab-display-image` skill is available, load it for full imageshow/viewer2d guidance.** This file covers blockedImage-specific visualization patterns only.

## Strategy: overview + detail for very large data
When data is too large to render at full resolution interactively, use a two-panel layout: a low-resolution overview for spatial orientation, and a high-resolution detail view for a cropped region of interest. This applies to both 2D (`viewer2d` + `imageshow`) and 3D (`viewer3d` + `volshow`). See "Overview + detail navigation" below for the 2D pattern, and `blocked-3d-volumes.md` "Overview + detail for large 3D volumes" for the 3D pattern.

## Basic display (R2024b+)
Use `imageshow` for display and exploration:
```matlab
imageshow(bim);
```
- Auto-selects resolution level based on zoom level and screen size
- Scroll to zoom, drag to pan
- Pixel info display in bottom-left corner (coordinates + color/intensity under cursor)
- Right-click context menu to hide pixel info


## World coordinates display
Parent `imageshow` to a `viewer2d` with `SpatialUnits` for labeled measurements:
```matlab
viewer = viewer2d(ScaleBar="on", SpatialUnits="mm", ScaleBarStyle="measure");
imageshow(bim, Parent=viewer);
```
Set `bim.WorldStart` and `bim.WorldEnd` to define the real-world coordinate mapping. Use `pixelSpacing * bim.Size(1,:)` to compute `WorldEnd` from known pixel size.

## Overlay display
Display a mask or label overlay on top of a blocked image:
```matlab
% Create mask at a coarse level (must fit in memory)
bmask = apply(bim, @(im) im2gray(im.Data) < 200, Level=2);

% Display with green overlay
imageshow(bim, OverlayData=bmask, OverlayColormap=[0 1 0]);
```
- `OverlayData` can be a single-level or multi-level blockedImage (must match `Size`, `BlockSize`, `NumLevels`, `WorldStart`, `WorldEnd` of the image)
- `OverlayAlpha` — uniform transparency (scalar)
- `OverlayAlphamap` + `OverlayDisplayRangeMode="data-range"` — per-class transparency (e.g., `[0.1 0.5]` for background vs foreground)

## Synchronized side-by-side comparison
Use `linkviewers` to sync zoom/pan across two displays:
```matlab
g = uigridlayout;
v1 = viewer2d(g); v1.Layout.Column = 1;
v2 = viewer2d(g); v2.Layout.Column = 2;
imageshow(bim, Parent=v1);
imageshow(bimProcessed, Parent=v2);
linkviewers([v1, v2]);
```

## Overview + detail navigation
Show a fixed coarse overview on the left with a rectangle ROI that controls a detail view on the right. Moving/resizing the ROI updates the detail view; zooming/panning the detail view updates the ROI.
```matlab
g = uigridlayout(uifigure, ColumnWidth={"1x","1x"}, RowHeight={"fit"});
vOverview = viewer2d(g, ScaleBar="off"); vOverview.Layout.Column = 1;
vDetail   = viewer2d(g, ScaleBar="off"); vDetail.Layout.Column = 2;

hOverview = imageshow(bim, Parent=vOverview);
hOverview.ResolutionLevel = bim.NumLevels;  % fix to coarsest
imageshow(bim, Parent=vDetail);              % auto level

% Draw rectangle ROI on overview
roi = uidraw(vOverview, "rectangle", Position=[x y w h], Color="r", Label="");
vOverview.Annotations = roi;

% Link: ROI <-> detail view via CameraViewport
vOverview.UserData.detail = vDetail;
vDetail.UserData.overview = vOverview;
addlistener(vDetail, "CameraMoved",    @(src,~) set(src.UserData.overview, Annotations=src.CameraViewport));
addlistener(vDetail, "CameraMoving",   @(src,~) set(src.UserData.overview, Annotations=src.CameraViewport));
addlistener(vOverview, "AnnotationMoved", @(src,~) set(src.UserData.detail, CameraViewport=src.Annotations));
```
Key properties: `viewer2d.CameraViewport` (get/set the visible region), `viewer2d.Annotations` (get/set ROI shapes), `imageshow.ResolutionLevel` (fix or let auto-manage).

## Annotations (R2026a+)
Draw annotations from the `viewer2d` toolbar or programmatically with `uidraw`:
```matlab
roi = uidraw(viewer, "freehand", Position=coords, Color="r", FaceAlpha=0.5, Label="tumor");
viewer.Annotations = roi;
```
Shapes: `"point"`, `"line"`, `"rectangle"`, `"circle"`, `"ellipse"`, `"polygon"`, `"polyline"`, `"freehand"`, `"angle"`. Pass a cell array of positions to create multiple ROIs at once.

With world coordinates and `SpatialUnits` set, annotation labels display real-world measurements. Use `Wait="none"` for non-blocking programmatic placement.

## Dynamic adapter property updates
When using a virtual composite adapter (e.g., channel mapping, colorization), updating adapter properties does not automatically refresh the display. Clear the internal cache and reassign to force a re-read:
```matlab
bimRGB.Adapter.RGBChannelMapping = [3 2 1];
bimRGB.BlockCache.reset();
hDisplay.CData = bimRGB;
```

## Fixing resolution level for overview panes
Pin an `imageshow` to a specific (coarse) resolution level for overview navigation:
```matlab
hOverview = imageshow(bim, Parent=vOverview);
hOverview.ResolutionLevel = bim.NumLevels;  % always show coarsest
```

## 3D volume visualization
For 3D blockedImage volumes, use `volshow` and `viewer3d` instead of `imageshow`/`viewer2d`. See `blocked-3d-volumes.md` for full `volshow` patterns (rendering styles, slice planes, overlays, side-by-side comparison with `linkviewers`).

----

Copyright 2026 The MathWorks, Inc.
