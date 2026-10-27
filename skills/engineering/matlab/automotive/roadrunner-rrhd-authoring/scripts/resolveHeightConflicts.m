function [lanes, laneBoundaries, info] = resolveHeightConflicts(lanes, laneBoundaries, zStep)
%resolveHeightConflicts Resolve overlapping lane height conflicts via graph coloring.
%   [lanes, laneBoundaries, info] = resolveHeightConflicts(lanes, laneBoundaries)
%   detects overlapping unconnected lanes at the same Z level and assigns
%   different elevations using greedy graph coloring. Prevents grass
%   artifacts where roads cross in RoadRunner.
%
%   [lanes, laneBoundaries, info] = resolveHeightConflicts(lanes, laneBoundaries, zStep)
%   uses a custom Z step in meters (default 0.15m).
%
%   Inputs:
%     lanes           - Array of roadrunner.hdmap.Lane objects
%     laneBoundaries  - Array of roadrunner.hdmap.LaneBoundary objects
%     zStep           - Elevation increment per level (default 0.15m)
%
%   Outputs:
%     lanes           - Lanes with resolved Z elevations
%     laneBoundaries  - Boundaries with resolved Z elevations
%     info            - Struct with nComponents, nZLevels, maxZ, lanesAdjusted

% Copyright 2026 The MathWorks, Inc.

    arguments
        lanes
        laneBoundaries
        zStep (1,1) double = 0.15
    end

    nLanes = numel(lanes);

    % Build ID maps
    bndIdx = containers.Map('KeyType','char','ValueType','double');
    for i = 1:numel(laneBoundaries), bndIdx(char(string(laneBoundaries(i).ID))) = i; end
    laneIdx = containers.Map('KeyType','char','ValueType','double');
    for i = 1:nLanes, laneIdx(char(string(lanes(i).ID))) = i; end

    % Normalize Z to 0
    for i = 1:nLanes, lanes(i).Geometry(:,3) = 0; end
    for i = 1:numel(laneBoundaries), laneBoundaries(i).Geometry(:,3) = 0; end

    % Union-find for connected components
    parent = 1:nLanes;
    for i = 1:nLanes
        for k = 1:numel(lanes(i).Predecessors)
            pid = char(string(lanes(i).Predecessors(k).Reference.ID));
            if isKey(laneIdx, pid), parent = ufUnion(parent, i, laneIdx(pid)); end
        end
        for k = 1:numel(lanes(i).Successors)
            sid = char(string(lanes(i).Successors(k).Reference.ID));
            if isKey(laneIdx, sid), parent = ufUnion(parent, i, laneIdx(sid)); end
        end
    end

    % Resolve to sequential component indices
    roots = arrayfun(@(x) ufFind(parent, x), 1:nLanes);
    [~, ~, compIdx] = unique(roots);
    nComps = max(compIdx);

    % Component members and bounding boxes
    compMembers = cell(nComps,1);
    compBB = zeros(nComps,4);  % [minX minY maxX maxY]
    for i = 1:nLanes, compMembers{compIdx(i)}(end+1) = i; end
    for c = 1:nComps
        xs = []; ys = [];
        for li = compMembers{c}
            g = lanes(li).Geometry;
            xs = [xs; g(:,1)]; ys = [ys; g(:,2)]; %#ok<AGROW>
        end
        compBB(c,:) = [min(xs) min(ys) max(xs) max(ys)];
    end

    % Build crossing adjacency via segment intersection
    compAdj = cell(nComps,1);
    for ci = 1:nComps
        for cj = ci+1:nComps
            % BB pre-filter
            if compBB(ci,1)>compBB(cj,3) || compBB(ci,3)<compBB(cj,1) || ...
               compBB(ci,2)>compBB(cj,4) || compBB(ci,4)<compBB(cj,2)
                continue;
            end
            % Segment intersection
            if checkCrossing(lanes, compMembers{ci}, compMembers{cj})
                compAdj{ci}(end+1) = cj;
                compAdj{cj}(end+1) = ci;
            end
        end
    end

    % Greedy graph coloring (highest degree first)
    compColor = zeros(nComps,1);
    degrees = cellfun(@numel, compAdj);
    [~, order] = sort(degrees, 'descend');
    for idx = 1:nComps
        c = order(idx);
        if isempty(compAdj{c}), continue; end
        neighborColors = compColor(compAdj{c});
        color = 0;
        while ismember(color, neighborColors), color = color + 1; end
        compColor(c) = color;
    end

    % Apply Z levels
    lanesAdjusted = 0;
    for c = 1:nComps
        if compColor(c) == 0, continue; end
        z = compColor(c) * zStep;
        for li = compMembers{c}
            lanes(li).Geometry(:,3) = z;
            lbID = char(string(lanes(li).LeftLaneBoundary.Reference.ID));
            rbID = char(string(lanes(li).RightLaneBoundary.Reference.ID));
            if isKey(bndIdx, lbID), laneBoundaries(bndIdx(lbID)).Geometry(:,3) = z; end
            if isKey(bndIdx, rbID), laneBoundaries(bndIdx(rbID)).Geometry(:,3) = z; end
        end
        lanesAdjusted = lanesAdjusted + numel(compMembers{c});
    end

    info = struct('nComponents',nComps, 'nZLevels',max(compColor)+1, ...
        'maxZ',max(compColor)*zStep, 'lanesAdjusted',lanesAdjusted);
end


function crosses = checkCrossing(lanes, membersA, membersB)
%checkCrossing Test if any lane segments from two components cross in 2D.
    crosses = false;
    for ai = membersA
        gA = lanes(ai).Geometry(:,1:2);
        for bi = membersB
            gB = lanes(bi).Geometry(:,1:2);
            for si = 1:size(gA,1)-1
                a1 = gA(si,:); a2 = gA(si+1,:);
                for sj = 1:size(gB,1)-1
                    b1 = gB(sj,:); b2 = gB(sj+1,:);
                    d1 = a2-a1; d2 = b2-b1;
                    denom = d1(1)*d2(2) - d1(2)*d2(1);
                    if abs(denom) < 1e-10, continue; end
                    db = b1-a1;
                    t = (db(1)*d2(2)-db(2)*d2(1))/denom;
                    u = (db(1)*d1(2)-db(2)*d1(1))/denom;
                    if t>=0 && t<=1 && u>=0 && u<=1
                        crosses = true; return;
                    end
                end
            end
        end
    end
end


function root = ufFind(parent, x)
%ufFind Find root with path compression.
    while parent(x) ~= x
        parent(x) = parent(parent(x));
        x = parent(x);
    end
    root = x;
end


function parent = ufUnion(parent, a, b)
%ufUnion Union two elements by rank.
    ra = ufFind(parent, a);
    rb = ufFind(parent, b);
    if ra ~= rb, parent(ra) = rb; end
end
