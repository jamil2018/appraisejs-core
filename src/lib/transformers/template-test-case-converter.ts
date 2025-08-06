import {
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
  TemplateStepIcon,
  StepParameterType,
} from "@prisma/client";
import { NodeOrderMap } from "@/types/diagram/diagram";

export interface ConvertedTestCaseData {
  title: string;
  description: string;
  testSuiteIds: string[];
  nodesOrder: NodeOrderMap;
}

export interface TestCaseFormData {
  title: string;
  description: string;
  testSuiteIds: string[];
  steps: {
    gherkinStep: string;
    label: string;
    icon: TemplateStepIcon;
    parameters: {
      name: string;
      value: string;
      type: StepParameterType;
      order: number;
    }[];
    order: number;
    templateStepId: string;
  }[];
}

/**
 * Converts a template test case to the format expected by the test case form component
 * @param templateTestCase - The template test case with steps and parameters
 * @returns Converted data in the format expected by TestCaseForm
 */
export const templateTestCaseToTestCaseConverter = (
  templateTestCase: TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[];
    })[];
  }
): ConvertedTestCaseData => {
  // Convert template test case to test case format
  const title = templateTestCase.name;
  const description = templateTestCase.description || "";
  const testSuiteIds: string[] = []; // Will be populated by user selection

  // Convert steps to NodeOrderMap format
  const nodesOrder: NodeOrderMap = {};

  templateTestCase.steps.forEach((step, index) => {
    const nodeId = `node-${index}`;

    // Convert parameters from template format to test case format
    const parameters = step.parameters.map((param) => ({
      name: param.name,
      value: param.defaultValue, // Convert defaultValue to value
      type: param.type,
      order: param.order,
    }));

    nodesOrder[nodeId] = {
      order: step.order,
      label: step.label,
      gherkinStep: step.gherkinStep,
      icon: step.icon as TemplateStepIcon,
      parameters,
      templateStepId: step.templateStepId,
    };
  });

  return {
    title,
    description,
    testSuiteIds,
    nodesOrder,
  };
};

/**
 * Converts NodeOrderMap to the format expected by TestCaseForm and createTestCaseAction
 * @param nodesOrder - The NodeOrderMap from the converter
 * @returns Data in the format expected by the test case form
 */
export const convertNodeOrderMapToTestCaseFormData = (
  nodesOrder: NodeOrderMap
): TestCaseFormData["steps"] => {
  return Object.entries(nodesOrder)
    .map(([, nodeData]) => ({
      gherkinStep: nodeData.gherkinStep || "",
      label: nodeData.label,
      icon: nodeData.icon as TemplateStepIcon,
      parameters: nodeData.parameters,
      order: nodeData.order,
      templateStepId: nodeData.templateStepId,
    }))
    .sort((a, b) => a.order - b.order);
};

/**
 * Converts a template test case directly to the format expected by createTestCaseAction
 * @param templateTestCase - The template test case with steps and parameters
 * @param testSuiteIds - Optional test suite IDs to assign
 * @returns Data ready for test case creation
 */
export const templateTestCaseToTestCaseFormData = (
  templateTestCase: TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[];
    })[];
  },
  testSuiteIds: string[] = []
): TestCaseFormData => {
  const convertedData = templateTestCaseToTestCaseConverter(templateTestCase);

  return {
    title: convertedData.title,
    description: convertedData.description,
    testSuiteIds:
      testSuiteIds.length > 0 ? testSuiteIds : convertedData.testSuiteIds,
    steps: convertNodeOrderMapToTestCaseFormData(convertedData.nodesOrder),
  };
};

/**
 * Validates if the converted data is ready for test case creation
 * @param convertedData - The converted test case data
 * @returns Validation result with any errors
 */
export const validateConvertedTestCaseData = (
  convertedData: ConvertedTestCaseData
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!convertedData.title || convertedData.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters long");
  }

  if (Object.keys(convertedData.nodesOrder).length === 0) {
    errors.push("At least one step is required");
  }

  // Validate each step
  Object.entries(convertedData.nodesOrder).forEach(([nodeId, nodeData]) => {
    if (!nodeData.label || nodeData.label.trim().length === 0) {
      errors.push(`Step ${nodeId}: Label is required`);
    }

    if (!nodeData.templateStepId) {
      errors.push(`Step ${nodeId}: Template step ID is required`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};
