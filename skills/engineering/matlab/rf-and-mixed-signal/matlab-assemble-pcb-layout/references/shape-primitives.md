# Shape Primitives Reference

Compact catalog of all shape primitives available for `pcbComponent` layers, Boolean operations, and DGS patterns. See SKILL.md for detailed usage examples.

## Traces

| Shape | Description | Key Properties |
|-------|-------------|----------------|
| `traceRectangular` | Rectangle centered at origin | `Length`, `Width`, `Center` |
| `traceLine` | Multi-segment line from angle/length vectors | `Length`, `Width`, `Angle`, `StartPoint`, `Corner` |
| `tracePoint` | Line trace from X/Y coordinate pairs | `TracePoints`, `Width`, `Corner`, `EnableRoundedEnds` |
| `traceSpiral` | Even-sided polygon spiral | `InnerDiameter`, `TraceWidth`, `Spacing`, `NumTurns`, `NumSides` |
| `traceTapered` | Tapered width transition with curvature control | `InputWidth`, `OutputWidth`, `Length`, `CurvatureRate`, `Symmetry` |
| `traceCross` | Cross-shaped trace (two perpendicular arms) | `Length` (2-el), `Width` (2-el), `Offset` |
| `traceStep` | Stepped impedance trace (cascaded widths) | `Length` (vector), `Width` (vector), `Symmetry` |
| `traceTee` | T-junction trace | `Length` (2-el), `Width` (2-el), `Offset` |

**Property notes:** `traceCross.Offset` shifts the intersection of the two arms from center (scalar, meters). `traceStep.Symmetry` controls which edge aligns across width transitions: `'Symmetric'` (default, centered), `'Left'`, or `'Right'`.

## Bends

| Shape | Description | Key Properties |
|-------|-------------|----------------|
| `bendCurved` | 90-degree bend with curved corner | `Length` (2-el), `Width` (2-el), `CurveRadius` |
| `bendMitered` | 90-degree bend with mitered corner | `Length` (2-el), `Width` (2-el), `MiterDiagonal` |
| `bendRightAngle` | 90-degree bend with sharp corner | `Length` (2-el), `Width` (2-el) |
| `ubendCurved` | U-bend with curved corners | `Length` (3-el), `Width` (3-el), `CurveRadius` |
| `ubendMitered` | U-bend with mitered corners | `Length` (3-el), `Width` (3-el), `MiterDiagonal` |
| `ubendRightAngle` | U-bend with sharp corners | `Length` (3-el), `Width` (3-el) |

## Curves, Rings, and Special Shapes

| Shape | Description | Key Properties |
|-------|-------------|----------------|
| `curve` | Arc or curved strip between two angles | `Radius`, `Width`, `ArcAngle` (2-el, degrees) |
| `radial` | Pie-slice / sector shape | `OuterRadius`, `InnerRadius`, `Angle` |
| `ringAnnular` | Circular annular ring | `InnerRadius`, `Width`, `Center` |
| `ringSquare` | Square annular ring | `InnerSide`, `Width`, `Center` |
| `splitRing` | Split-ring resonator (circle, triangle, square, hex, octagon) | `Type`, `NumRings`, `RingDiameter`, `TraceWidth`, `SplitGap`, `SplitAngle` |
| `delta` | Triangular sector shape | `OuterRadius`, `InnerRadius`, `Angle` |
| `dumbbell` | Dumbbell shape (polygon or circle ends) | `Type`, `ArmLength`, `ArmWidth`, `Diameter`/`SideLength` |
| `racetrack` | Stadium / racetrack shape | `Type`, `Length`, `Width`, `AnchorPoints` |

## Common Operations

All shapes share: `+` (union), `-` (subtract), `&` (intersect), `translate`, `rotateZ`, `scale`, `mirrorX`/`mirrorY`, `copy`, `show`, `mesh`, `area`.

----

Copyright 2026 The MathWorks, Inc.
