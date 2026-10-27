# Reference: Extract Semantics

## Description
Extracts semantic information from Lanelet2 data and maps it to RRHD equivalents:
- **Lane markings:** Maps linestring `type`/`subtype` tags (e.g. `line_thin`/`solid`) to RRHD marking asset paths
- **Speed limits:** Collects unique speed limit values and groups lanelets by value
- **Lane types:** Maps lanelet `subtype` (road, highway, crosswalk, etc.) to RRHD `LaneType`

### Linestring Type Mapping
| Lanelet2 subtype | RRHD Marking Asset | Marking ID |
|------------------|-------------------|------------|
| `solid` | `SolidSingleWhite.rrlms` | `SolidWhite` |
| `dashed` | `DashedSingleWhite.rrlms` | `DashedWhite` |
| `solid_solid` | `SolidDoubleYellow.rrlms` | `SolidDoubleYellow` |
| `dashed_solid` | `DashedSolidYellow.rrlms` | `DashedSolidYellow` |
| `solid_dashed` | `DashedSolidYellow.rrlms` (+ `FlipLaterally=true`) | `DashedSolidYellow` |

## Inputs
| Parameter | Type | Description |
|-----------|------|-------------|
| `lanelets` | struct array | From `extractLanelets` |
| `ll2` | struct | Parsed Lanelet2 data from `readOSM` |

## Output
`sem` — struct with:
| Field | Type | Description |
|-------|------|-------------|
| `.markingMap` | containers.Map | wayID -> struct(type, subtype, rrhdAsset, rrhdMarkingID) |
| `.speedLimits` | struct array | Each with `.value` (double), `.laneletIDs` (string array) |
| `.laneTypeMap` | containers.Map | laneletID -> RRHD lane type string |

## Validated Implementation Pattern
```matlab
% Marking lookup: way subtype -> RRHD asset/ID
markingLookup = containers.Map( ...
    {'solid','dashed','solid_solid','dashed_solid','solid_dashed'}, ...
    {struct('asset','Assets/Markings/SolidSingleWhite.rrlms','id','SolidWhite'), ...
     struct('asset','Assets/Markings/DashedSingleWhite.rrlms','id','DashedWhite'), ...
     struct('asset','Assets/Markings/SolidDoubleYellow.rrlms','id','SolidDoubleYellow'), ...
     struct('asset','Assets/Markings/DashedSolidYellow.rrlms','id','DashedSolidYellow'), ...
     struct('asset','Assets/Markings/DashedSolidYellow.rrlms','id','DashedSolidYellow','flip',true)});

% Build markingMap by scanning way tags
sem.markingMap = containers.Map('KeyType','char','ValueType','any');
sem.markingDefs = containers.Map('KeyType','char','ValueType','any');
wayKeys = ways.keys;
for i = 1:numel(wayKeys)
    w = ways(wayKeys{i});
    if w.tags.isKey('subtype')
        subtype = w.tags('subtype');
        if markingLookup.isKey(subtype)
            info = markingLookup(subtype);
            sem.markingMap(wayKeys{i}) = info;
            sem.markingDefs(info.id) = info;  % unique marking definitions
        end
    end
end

% Lane type mapping
ltLookup = containers.Map( ...
    {'road','highway','parking','bicycle_lane','emergency_lane','bus_lane'}, ...
    {'Driving','Driving','Parking','Biking','Shoulder','Driving'});
% NOTE: 'crosswalk' and 'walkway' subtypes are NOT lanes — they become CurveMarkings (Step 8b)

sem.laneTypeMap = containers.Map('KeyType','char','ValueType','char');
for i = 1:numel(lanelets)
    st = char(lanelets(i).subtype);
    if ltLookup.isKey(st)
        sem.laneTypeMap(char(lanelets(i).id)) = ltLookup(st);
    else
        sem.laneTypeMap(char(lanelets(i).id)) = 'Driving';
    end
end
```

> **Note:** Ways without `type`/`subtype` tags have no lane markings — their boundaries
> should get no `ParametricAttributes` (unmarked/virtual boundaries).

## Example
```matlab
info = sem.markingMap('70');  % Get marking info for way ID "70"
```

----

Copyright 2026 The MathWorks, Inc.
