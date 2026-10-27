# Simulink Model Performance Test Template

Use this template when benchmarking Simulink model operations (load, compile, simulate).

```matlab
classdef ModelPerformanceTest < matlab.perftest.TestCase
%ModelPerformanceTest Performance test for Simulink model
%   Tests model load and simulation phases.
%
%   Run with: results = runperf('ModelPerformanceTest');

    properties (TestParameter)
        ModelName = {'myModel_small', 'myModel_large'}
    end

    properties
        loadedModel
    end

    methods (TestMethodTeardown)
        function cleanupModel(testCase) %#ok<MANU>
            bdclose('all');
        end
    end

    methods (Test)
        function testModelLoad(testCase, ModelName)
            testCase.startMeasuring();
            load_system(ModelName);
            testCase.stopMeasuring();

            testCase.verifyTrue(bdIsLoaded(ModelName));
        end

        function testModelSimulation(testCase, ModelName)
            % Load outside measurement
            load_system(ModelName);

            testCase.startMeasuring();
            sim(ModelName);
            testCase.stopMeasuring();
        end
    end
end
```

## Notes

- Use `startMeasuring`/`stopMeasuring` to isolate specific phases (load vs compile vs simulate)
- Model load should be measured separately from simulation
- Close models in `TestMethodTeardown` to avoid state leakage between tests
- For meaningful results, ensure the phase of interest runs for at least a few seconds

Copyright 2026 The MathWorks, Inc.
