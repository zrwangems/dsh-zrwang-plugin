classdef FeaturePerformanceTest < matlab.perftest.TestCase
%FeaturePerformanceTest Performance tests for <Feature>
%   Tests <function/API> at various data sizes using the
%   matlab.perftest.TestCase framework.
%
%   Run with: results = runperf('FeaturePerformanceTest');

    properties (MethodSetupParameter)
        % Use struct for complex parameter sets
        DataSize = struct('Small', struct('n', 100, 'desc', 'baseline'), ...
                          'Medium', struct('n', 1000, 'desc', 'typical'), ...
                          'Large', struct('n', 10000, 'desc', 'stress'))
    end

    properties
        inputData
        expectedSize
        rngState
    end

    methods (TestMethodSetup)
        function setupData(testCase, DataSize)
            % ALL setup must be here, outside measurement boundary
            testCase.rngState = rng(42, 'twister');
            n = DataSize.n;
            testCase.inputData = randn(n, 1);
            testCase.expectedSize = [n 1];
        end
    end

    methods (TestMethodTeardown)
        function restoreRng(testCase)
            rng(testCase.rngState);
        end
    end

    methods (Test)
        function testFastFunction(testCase, DataSize) %#ok<INUSD>
            % Use keepMeasuring for fast operations (<10ms)
            data = testCase.inputData;
            while testCase.keepMeasuring
                result = targetFunction(data);
            end
            testCase.verifyEqual(size(result), testCase.expectedSize);
        end

        function testSlowFunction(testCase, DataSize) %#ok<INUSD>
            % For slower operations (>10ms), no keepMeasuring needed
            % The entire Test method body is measured
            data = testCase.inputData;
            result = slowTargetFunction(data);
            testCase.verifyNotEmpty(result);
        end

        function testWithBoundaries(testCase, DataSize) %#ok<INUSD>
            % Use startMeasuring/stopMeasuring for mid-test setup
            data = testCase.inputData;

            % Pre-computation (not measured)
            preparedData = preprocess(data);

            testCase.startMeasuring();
            result = targetFunction(preparedData);
            testCase.stopMeasuring();

            % Verification (not measured)
            testCase.verifyTrue(isvalid(result));
        end
    end
end

% Copyright 2026 The MathWorks, Inc.
