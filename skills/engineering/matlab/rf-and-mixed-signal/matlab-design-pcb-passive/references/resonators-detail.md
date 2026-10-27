# Resonators, Baluns & Phase Shifters — Detailed Reference

## splitRing Shape Primitive

`splitRing` is a shape object (not a standalone EM component). Attach it to `resonatorSplitRingCustom` via the `Resonator` property, or embed it in a custom `pcbComponent`.

```matlab
s = splitRing;                                              % Default: Circle, 2 rings
s = splitRing(Type="Hexagon", NumRings=3);
s = splitRing(Type="Triangle", NumRings=4, SplitSide=[1 2 3 1]);
s = splitRing(Type="Square");
```

**Available types:** `'Circle'`, `'Square'`, `'Hexagon'`, `'Triangle'`

| Property | Description |
|----------|-------------|
| `Type` | Shape type |
| `NumRings` | Number of concentric rings |
| `RingDiameterInner` / `SideLengthInner` | Inner ring size (circular / polygonal) |
| `RingDiameterOuter` / `SideLengthOuter` | Outer ring size |
| `TraceWidth` | Ring trace width |
| `SplitGap` | Gap width in each ring |
| `SplitAngle` | Angle of split for each ring (vector) — circular types only |
| `SplitSide` | Side index for polygonal splits (vector) — polygonal types only |
| `ReferencePoint` | XY placement offset |

### SplitAngle vs SplitSide

For circular split rings, use `SplitAngle` (degrees). For polygonal types (Square, Hexagon, Triangle), use `SplitSide` (integer side index). Setting the wrong property for the shape type will be ignored.

### Polygonal SplitSide Defaults

When creating a `splitRing` with `Type="Hexagon"` and `NumRings>2`, the default `SplitSide=[1 1]` is often invalid — hexagons require `SplitSide` values from {2, 3, 5, 6}. Always set `SplitSide` explicitly when using polygonal types with multiple rings.

## Complementary Split-Ring Resonators (CSRR)

CSRRs are etched into the ground plane. Build them with Gerber import or Boolean subtraction:

```matlab
P = gerberRead('csrr_top.gtl', 'csrr_bot.gbl');
pb = pcbComponent(P);
pb.BoardShape = antenna.Rectangle('Length', L, 'Width', W);
pb.Substrate = dielectric(...);
pb.BoardThickness = h;
```

## SIW Integration

Split-ring resonators can be embedded in SIW bandpass filters:

```matlab
f = SIWFilter;
f.Resonator = splitRing(Type="Circle");
f.NumResonators = 3;
f.ResonatorSpacing = 5e-3;
```

## Balun Section-Design Functions

`balunCoupledLine` has no `design()` method. Use three section-design functions:

```matlab
% 1. Design coupled-line section
[L, W, S] = designCoupledLine(balunCoupledLine, 4e9, Z0e=159, Z0o=51);
b.CoupledLineLength  = L;
b.CoupledLineWidth   = W;
b.CoupledLineSpacing = S;

% 2. Design output line section
[L, W] = designOutputLine(balunCoupledLine, 4e9, Z0e=159, Z0o=51, Z0=59, Zref=50);
b.OutputLineLength = L;
b.OutputLineWidth  = W;

% 3. Design uncoupled line section
[L, W] = designUncoupledLine(balunCoupledLine, 4e9, Z0=59);
```

### Uncoupled Line Shape

The uncoupled line section uses a `ubendMitered` shape by default:

```matlab
b.UncoupledLineShape = ubendMitered;
b.UncoupledLineShape.Length = [L1, L2, L3];     % Array: one per segment
b.UncoupledLineShape.Width  = [W1, W2, W3];
```

The `Length` and `Width` of `ubendMitered` are arrays — one value per segment. Mismatched array sizes will error.

## Double Radial Stub Configuration

For a double stub, `OuterRadius`, `InnerRadius`, and `Angle` accept 2-element vectors to independently configure each stub:

```matlab
stub = stubRadialShunt(StubType="Double", ...
    OuterRadius=[8e-3, 7e-3], InnerRadius=[1.2e-3, 1e-3], Angle=[90, 80]);
show(stub);
s = sparameters(stub, linspace(1e9, 6e9, 101));
rfplot(s);
```

A scalar value applies the same dimension to both stubs.

----

Copyright 2026 The MathWorks, Inc.
