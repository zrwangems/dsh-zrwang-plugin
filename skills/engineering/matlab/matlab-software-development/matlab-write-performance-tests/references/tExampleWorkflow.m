classdef tExampleWorkflow < matlab.perftest.TestCase
%tExampleWorkflow End-to-end performance benchmark for a workflow
%   Measures a single representative customer workflow with realistic
%   data sizes. No parameterization — one testpoint per workflow.
%
%   Run with: results = runperf('tExampleWorkflow');

% Copyright 2026 The MathWorks, Inc.

    properties
        inputData       % Pre-loaded data for the workflow
    end

    methods (TestClassSetup)
        function loadData(testCase)
            % Load data and construct any reusable objects here.
            % This runs once per test class, outside the measurement boundary.
            testCase.inputData = load('workflowData.mat');
        end
    end

    methods (TestMethodSetup)
        function resetRNG(~)
            % Seed RNG for deterministic results across runs.
            rng(0, 'twister');
        end
    end

    methods (Test)
        function benchWorkflow(testCase)
            % Extract data to local variables for clarity.
            data = testCase.inputData;

            testCase.startMeasuring();

            % === Measured workflow ===
            % Step 1: Create/configure
            obj = createObject(data.input);

            % Step 2: Compute
            result = compute(obj, Display="off");

            % Step 3: Summarize/report
            output = summary(result);

            testCase.stopMeasuring();

            % Lightweight correctness checks (outside measurement)
            testCase.verifyNotEmpty(result);
            testCase.verifyNotEmpty(output);
        end
    end
end
