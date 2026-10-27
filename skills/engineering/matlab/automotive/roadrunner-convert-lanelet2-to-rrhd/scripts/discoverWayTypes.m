function discovery = discoverWayTypes(ways)
%discoverWayTypes Categorize all ways by type tag into functional buckets
%   discovery = discoverWayTypes(ways) scans all ways in a parsed Lanelet2
%   map and categorizes them by their 'type' tag into named buckets for
%   downstream RRHD mapping.
%
%   Input:
%       ways - containers.Map of ways (from parseOSM output)
%
%   Output:
%       discovery - Struct with fields:
%           .stopLineWays          - Cell array of stop line way structs
%           .pedestrianMarkingWays - Cell array of pedestrian marking ways
%           .zebraMarkingWays      - Cell array of zebra marking ways
%           .bikeMarkingWays       - Cell array of bike marking ways
%           .zigzagWays            - Cell array of zig-zag marking ways
%           .fenceWays             - Cell array of fence ways
%           .guardRailWays         - Cell array of guard rail ways
%           .jerseyBarrierWays     - Cell array of jersey barrier ways
%           .wallWays              - Cell array of wall ways
%           .curbstoneWays         - Cell array of curbstone ways
%           .trafficSignWays       - Cell array of traffic sign ways
%           .trafficLightWays      - Cell array of traffic light ways
%           .unmapped              - containers.Map (type -> count)

% Copyright 2026 The MathWorks, Inc.

    arguments
        ways containers.Map
    end

    discovery.stopLineWays = {};
    discovery.pedestrianMarkingWays = {};
    discovery.zebraMarkingWays = {};
    discovery.bikeMarkingWays = {};
    discovery.zigzagWays = {};
    discovery.fenceWays = {};
    discovery.guardRailWays = {};
    discovery.jerseyBarrierWays = {};
    discovery.wallWays = {};
    discovery.curbstoneWays = {};
    discovery.trafficSignWays = {};
    discovery.trafficLightWays = {};
    discovery.unmapped = containers.Map("KeyType", "char", "ValueType", "double");

    wayKeys = ways.keys;
    for i = 1:numel(wayKeys)
        w = ways(wayKeys{i});
        if ~w.tags.isKey("type")
            continue
        end
        wType = w.tags("type");

        % Split compound types like "traffic_sign/de205" or "curbstone/high"
        typeParts = strsplit(wType, "/");
        baseType = typeParts{1};

        switch baseType
            case "stop_line"
                discovery.stopLineWays{end + 1} = w;
            case "pedestrian_marking"
                discovery.pedestrianMarkingWays{end + 1} = w;
            case "zebra_marking"
                discovery.zebraMarkingWays{end + 1} = w;
            case "bike_marking"
                discovery.bikeMarkingWays{end + 1} = w;
            case {"zig-zag", "zig_zag"}
                discovery.zigzagWays{end + 1} = w;
            case "fence"
                discovery.fenceWays{end + 1} = w;
            case "guard_rail"
                discovery.guardRailWays{end + 1} = w;
            case "jersey_barrier"
                discovery.jerseyBarrierWays{end + 1} = w;
            case "wall"
                discovery.wallWays{end + 1} = w;
            case "curbstone"
                discovery.curbstoneWays{end + 1} = w;
            case "traffic_sign"
                discovery.trafficSignWays{end + 1} = w;
            case "traffic_light"
                discovery.trafficLightWays{end + 1} = w;
            case {"line_thin", "line_thick", "virtual", "road_border", "rail", "keepout", "symbol"}
                % Boundary lines or lane-related — handled via lanelet extraction
            otherwise
                if discovery.unmapped.isKey(wType)
                    discovery.unmapped(wType) = discovery.unmapped(wType) + 1;
                else
                    discovery.unmapped(wType) = 1;
                end
        end
    end
end
