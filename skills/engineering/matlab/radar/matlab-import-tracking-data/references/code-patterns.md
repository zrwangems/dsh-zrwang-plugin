# Complete Code Patterns

## Flight Log → Scenario Recording (Geodetic, ECEF output)

```matlab
%% 1. Read data
rawTable = readtable("flight_data.csv", TextType="string", VariableNamingRule="preserve");

%% 2. Extract and convert
% Time
epochSec = rawTable.("timestamp");
dt = datetime(epochSec, 'ConvertFrom', 'posixtime');
simTime = seconds(dt - dt(1));

% Platform IDs — remap to sequential integers
rawPID = rawTable.("aircraft_id");
[~, ~, platformIDs] = unique(rawPID, 'stable');

% Position: geodetic → ECEF
lat = rawTable.("lat");  lon = rawTable.("lon");
alt = rawTable.("alt") * 0.3048;  % ft → m (adjust as needed)
[xE, yE, zE] = geodetic2ecef(wgs84Ellipsoid, lat, lon, alt);
posECEF = [xE yE zE];

% Velocity: NED → ECEF (vectorized, no Aerospace Toolbox needed)
velNED = [rawTable.("vn"), rawTable.("ve"), rawTable.("vd")];
[vxE, vyE, vzE] = ned2ecefv(velNED(:,1), velNED(:,2), velNED(:,3), lat, lon);
velECEF = [vxE vyE vzE];

% Orientation: Euler (deg) → quaternion, NED → ECEF
yaw_r = deg2rad(rawTable.("heading"));
pitch_r = deg2rad(rawTable.("pitch"));
roll_r = deg2rad(rawTable.("roll"));
qNED = quaternion([yaw_r pitch_r roll_r], 'euler', 'ZYX', 'frame');
qECEF = quaternion.zeros(height(rawTable), 1);
for ii = 1:height(rawTable)
    latR = deg2rad(lat(ii)); lonR = deg2rad(lon(ii));
    R = [-sin(latR)*cos(lonR), -sin(latR)*sin(lonR),  cos(latR);
         -sin(lonR),            cos(lonR),             0;
         -cos(latR)*cos(lonR), -cos(latR)*sin(lonR), -sin(latR)];
    qECEF(ii) = quaternion(R, 'rotmat', 'frame') * qNED(ii);
end

% Defaults for missing states
acc = zeros(height(rawTable), 3);
angVel = zeros(height(rawTable), 3);

%% 3. Sort by time
[simTime, si] = sort(simTime);
platformIDs = platformIDs(si); posECEF = posECEF(si,:);
velECEF = velECEF(si,:); acc = acc(si,:);
qECEF = qECEF(si); angVel = angVel(si,:);

%% 4. Build trackingScenarioRecording
uniqueTimes = unique(simTime, 'stable');
recordedData = struct('SimulationTime', cell(numel(uniqueTimes),1), 'Poses', []);
for ii = 1:numel(uniqueTimes)
    idx = find(simTime == uniqueTimes(ii));
    poses = repmat(struct('PlatformID',[],'ClassID',[],'Position',[], ...
        'Velocity',[],'Acceleration',[],'Orientation',[],'AngularVelocity',[]), numel(idx), 1);
    for jj = 1:numel(idx)
        k = idx(jj);
        poses(jj) = struct('PlatformID',platformIDs(k), 'ClassID',0, ...
            'Position',posECEF(k,:), 'Velocity',velECEF(k,:), ...
            'Acceleration',acc(k,:), 'Orientation',qECEF(k), ...
            'AngularVelocity',angVel(k,:));
    end
    recordedData(ii).SimulationTime = uniqueTimes(ii);
    recordedData(ii).Poses = poses;
end
tsr = trackingScenarioRecording(recordedData, ...
    CoordinateSystem="Geodetic", IsEarthCentered=true);
```

## Driving Log → Truth Log (Cartesian Scenario frame)

```matlab
%% 1. Read data
rawTable = readtable("driving_data.csv", TextType="string", VariableNamingRule="preserve");

%% 2. Extract
timeSec = rawTable.("time");
simTime = timeSec - timeSec(1);
[~, ~, platformIDs] = unique(rawTable.("object_id"), 'stable');
pos = [rawTable.("x") rawTable.("y") rawTable.("z")];
vel = [rawTable.("vx") rawTable.("vy") rawTable.("vz")];
acc = [rawTable.("ax") rawTable.("ay") rawTable.("az")];
ori = quaternion(deg2rad([rawTable.("yaw") rawTable.("pitch") rawTable.("roll")]), ...
    'euler', 'ZYX', 'frame');
angVel = zeros(height(rawTable), 3);
angAcc = zeros(height(rawTable), 3);

%% 3. Sort
[simTime, si] = sort(simTime);
platformIDs=platformIDs(si); pos=pos(si,:); vel=vel(si,:); acc=acc(si,:);
ori=ori(si); angVel=angVel(si,:); angAcc=angAcc(si,:);

%% 4. Build truth log
uniqueTimes = unique(simTime, 'stable');
truthLog = cell(numel(uniqueTimes), 1);
for ii = 1:numel(uniqueTimes)
    idx = find(simTime == uniqueTimes(ii));
    poses = repmat(struct('Time',NaN,'PlatformID',NaN,'ClassID',NaN, ...
        'Position',NaN(1,3),'Velocity',NaN(1,3),'Acceleration',NaN(1,3), ...
        'Orientation',NaN,'AngularVelocity',NaN(1,3),'AngularAcceleration',NaN(1,3)), ...
        numel(idx), 1);
    for jj = 1:numel(idx)
        k = idx(jj);
        poses(jj) = struct('Time',uniqueTimes(ii), 'PlatformID',platformIDs(k), ...
            'ClassID',0, 'Position',pos(k,:), 'Velocity',vel(k,:), ...
            'Acceleration',acc(k,:), 'Orientation',ori(k), ...
            'AngularVelocity',angVel(k,:), 'AngularAcceleration',angAcc(k,:));
    end
    truthLog{ii} = poses;
end
```

## GPS Log → Tuning Data (ECEF output)

```matlab
%% 1. Read data
rawTable = readtable("gps_log.csv", TextType="string", VariableNamingRule="preserve");

%% 2. Extract
epochSec = rawTable.("timestamp");
dt = datetime(epochSec, 'ConvertFrom', 'posixtime');

lat = rawTable.("latitude"); lon = rawTable.("longitude"); alt = rawTable.("altitude");
[xE, yE, zE] = geodetic2ecef(wgs84Ellipsoid, lat, lon, alt);
pos = [xE yE zE];

% Velocity if available, else zeros
if all(ismember(["vn","ve","vd"], rawTable.Properties.VariableNames))
    velNED = [rawTable.("vn") rawTable.("ve") rawTable.("vd")];
    [vxE, vyE, vzE] = ned2ecefv(velNED(:,1), velNED(:,2), velNED(:,3), lat, lon);
    vel = [vxE vyE vzE];
else
    vel = zeros(height(rawTable), 3);
end

if ismember("id", rawTable.Properties.VariableNames)
    [~,~,platformIDs] = unique(rawTable.("id"), 'stable');
else
    platformIDs = ones(height(rawTable), 1);
end

acc = zeros(height(rawTable), 3);

%% 3. Sort
[dt, si] = sort(dt);
platformIDs=platformIDs(si); pos=pos(si,:); vel=vel(si,:); acc=acc(si,:);

%% 4. Build tuning data (position, velocity, acceleration only)
uniquePIDs = unique(platformIDs, 'stable');
startTime = min(dt);
tuningData = cell(numel(uniquePIDs), 1);
for ii = 1:numel(uniquePIDs)
    idx = platformIDs == uniquePIDs(ii);
    Time = dt(idx) - startTime;
    tuningData{ii} = timetable(Time, ...
        repmat(uniquePIDs(ii),sum(idx),1), pos(idx,:), vel(idx,:), acc(idx,:), ...
        VariableNames=["PlatformID","Position","Velocity","Acceleration"]);
end
if isscalar(tuningData), tuningData = tuningData{1}; end
```


----

Copyright 2026 The MathWorks, Inc.
