# Static Objects & Props Asset Mapping

Maps object types from source formats to RoadRunner prop assets.

## Trees & Vegetation

| Type | Asset Path | Notes |
|---|---|---|
| `tree` (default) | `Props/Trees/Eucalyptus_Sm01.fbx` | OpenDRIVE default |
| `vegetation` (default) | `Props/Trees/Bush_Sm01.fbx` | OpenDRIVE default |
| tree (various) | `Props/Trees/Ash01.fbx` | Multiple species available |
| tree (various) | `Props/Trees/Birch01.fbx` | |
| tree (various) | `Props/Trees/Elm01.fbx` | |
| tree (various) | `Props/Trees/Maple01.fbx` | |
| tree (palm) | `Props/Trees/CalPalm_Full_Lg01.fbx` | Multiple sizes |
| tree (pine) | `Props/Trees/CoulPine_Lg01.fbx` | Multiple sizes |
| tree (cypress) | `Props/Trees/Cypress_Lg01.fbx` | |

## Poles & Posts

| Type | Height | Asset Path |
|---|---|---|
| Sign post (10ft) | 3.0m | `Props/Signals/SignPost_10ft.fbx` |
| Sign post (8ft) | 1.2m | `Props/Signals/SignPost_8ft.fbx` |
| Signal post (30ft) | 9.1m | `Props/Signals/Signal_Post_30ft.fbx` |
| Signal post (17ft) | 5.2m | `Props/Signals/Signal_Post_17ft.fbx` |
| Signal post (12ft) | 3.7m | `Props/Signals/Signal_Post_12ft.fbx` |
| Signal mast arm (15-45ft) | varies | `Props/Signals/Signal_MastArm_XXft.fbx` |
| Street light | — | `Props/Signals/StreetLight_30ft.rrpa` |
| Utility pole (30-60ft) | varies | `Props/ElectricPoles/UtilityPole_XXft.fbx` |
| Electrical tower | — | `Props/ElectricPoles/ElectricalTower01_100ft.fbx` |
| Wood post (8-10ft) | varies | `Props/Signals/WoodPost_Xft.fbx` |
| Metal cylinder post | varies | `Props/Signals/Metal_CylinderPost_Xft.fbx` |

## Traffic Control

| Type | Asset Path |
|---|---|
| Traffic cone | `Props/TrafficControl/TrafficCone01.fbx` |
| Barricade | `Props/TrafficControl/Barricade01.fbx` |
| Drum | `Props/TrafficControl/Drum01.fbx` |
| Grabber/delineator | `Props/TrafficControl/Grabber01.fbx` |
| Leitpfosten (DE) | `Props/TrafficControl/Leitpfosten01.fbx` |
| Arrow board | `Props/TrafficControl/ArrowBoard01.fbx` |
| Chevron sign | `Props/TrafficControl/ChevronSign01.fbx` |
| Stripe sign | `Props/TrafficControl/StripeSign01.fbx` |

## Misc Props

| Type | Asset Path |
|---|---|
| Rock (multiple) | `Props/Misc/Rock01.fbx` through `Rock04.fbx` |
| Wall | `Props/Misc/Wall.fbx` |
| Trashcan | `Props/Construction/Trashcan01.fbx` |
| Dumpster (large) | `Props/Construction/Dumpster_Lg01.fbx` |
| Dumpster (small) | `Props/Construction/Dumpster_Sm01.fbx` |
| Construction cart | `Props/Construction/ConstructionCart.fbx` |
| Vending machine (JP) | `Props/Japan/VendingMachine_01.fbx` |

## Vehicles (OpenSCENARIO)

| Type | Asset Path |
|---|---|
| Sedan | `Vehicles/Sedan.fbx` |
| SUV | `Vehicles/Suv.fbx` |
| Compact car | `Vehicles/CompactCar.fbx` |
| Pickup truck | `Vehicles/PickupTruck.fbx` |
| Delivery van | `Vehicles/DeliveryVan.fbx` |
| Semi truck | `Vehicles/SemiTruck.fbx` |
| School bus | `Vehicles/SchoolBus.fbx` |
| Ambulance | `Vehicles/Ambulance.fbx` |
| Garbage truck | `Vehicles/GarbageTruck.fbx` |
| Utility truck | `Vehicles/UtilityTruck.fbx` |
| Cement truck | `Vehicles/CementTruck.fbx` |
| Backhoe | `Vehicles/Backhoe.fbx` |

## Pedestrians (OpenSCENARIO)

| Type | Asset Path |
|---|---|
| Female business | `Characters/Citizen Female Business01.rrchar` |
| Female casual | `Characters/Citizen Female Casual01.rrchar` |
| Female elder | `Characters/Citizen Female Elder01.rrchar` |
| Male business | `Characters/Citizen Male Business01.rrchar` |
| Male casual | `Characters/Citizen Male Casual01.rrchar` |
| Male child | `Characters/Citizen Male Child01.rrchar` |
| Male elder | `Characters/Citizen Male Elder01.rrchar` |

## OpenDRIVE Object Type → Asset Mapping

| `<object type="...">` | Default Asset |
|---|---|
| `obstacle` | `Props/TrafficControl/TrafficCone01.fbx` |
| `pole` | `Props/Signals/SignPost_10ft.fbx` (Height=3m) |
| `tree` | `Props/Trees/Eucalyptus_Sm01.fbx` |
| `vegetation` | `Props/Trees/Bush_Sm01.fbx` |
| `barrier` | `Props/Construction/Barricade01.fbx` |
| `trafficIsland` | `Materials/Concrete1.rrmtl` (material, not prop) |
| `crosswalk` | `Markings/ContinentalCrosswalk.rrcws` |
| `roadMark` (StopLine) | `Markings/StopLine.rrlms` |
| `roadMark` (arrow) | `Stencils/Stencil_ArrowType4L.svg` |
| `patch` | `Damage/AsphaltPatch01.rrpms` |

## MATLAB Construction Pattern

```matlab
% StaticObjectType
sot = roadrunner.hdmap.StaticObjectType;
sot.ID = "TrafficCone";
rap = roadrunner.hdmap.RelativeAssetPath;
rap.AssetPath = "Assets/Props/TrafficControl/TrafficCone01.fbx";
sot.AssetPath = rap;

% StaticObject instance
so = roadrunner.hdmap.StaticObject;
so.ID = "Object_1";
gobb = roadrunner.hdmap.GeoOrientedBoundingBox;
gobb.Center = [x, y, z];
gobb.Dimension = [0.3, 0.3, 0.7];  % width, depth, height
gobb.GeoOrientation = [0, 0, yawDeg];
so.Geometry = gobb;
typeRef = roadrunner.hdmap.Reference;
typeRef.ID = "TrafficCone";
so.ObjectTypeReference = typeRef;
```

----

Copyright 2026 The MathWorks, Inc.
