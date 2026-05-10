import {
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
  TemplateTestCaseFlowBlock,
  TemplateTestCaseFlowBlockNode,
  TemplateStepIcon,
} from '@prisma/client'
import { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'

export interface ConvertedTestCaseData {
  title: string
  description: string
  testSuiteIds: string[]
  nodesOrder: NodeOrderMap
  flowBlocks: FlowBlock[]
}

/**
 * Converts a template test case to the format expected by the test case form component
 * @param templateTestCase - The template test case with steps and parameters
 * @returns Converted data in the format expected by TestCaseForm
 */
export const templateTestCaseToTestCaseConverter = (
  templateTestCase: TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[]
    })[]
    flowBlocks?: (TemplateTestCaseFlowBlock & { nodes: TemplateTestCaseFlowBlockNode[] })[]
  },
): ConvertedTestCaseData => {
  // Convert template test case to test case format
  const title = templateTestCase.name
  const description = templateTestCase.description || ''
  const testSuiteIds: string[] = [] // Will be populated by user selection

  // Convert steps to NodeOrderMap format
  const nodesOrder: NodeOrderMap = {}

  templateTestCase.steps.forEach((step, index) => {
    const nodeId = step.flowNodeId ?? `node-${index}`

    // Convert parameters from template format to test case format
    const parameters = step.parameters.map(param => ({
      name: param.name,
      value: param.defaultValue, // Convert defaultValue to value
      type: param.type,
      order: param.order,
    }))

    nodesOrder[nodeId] = {
      nodeId,
      order: step.order,
      label: step.label,
      gherkinStep: step.gherkinStep,
      icon: step.icon as TemplateStepIcon,
      parameters,
      templateStepId: step.templateStepId,
    }
  })

  return {
    title,
    description,
    testSuiteIds,
    nodesOrder,
    flowBlocks:
      templateTestCase.flowBlocks?.map(block => ({
        id: block.id,
        name: block.name,
        nodeIds: block.nodes.map(node => node.flowNodeId),
      })) ?? [],
  }
}

/**
 * Validates if the converted data is ready for test case creation
 * @param convertedData - The converted test case data
 * @returns Validation result with any errors
 */
export const validateConvertedTestCaseData = (
  convertedData: ConvertedTestCaseData,
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!convertedData.title || convertedData.title.trim().length < 3) {
    errors.push('Title must be at least 3 characters long')
  }

  if (Object.keys(convertedData.nodesOrder).length === 0) {
    errors.push('At least one step is required')
  }

  // Validate each step
  Object.entries(convertedData.nodesOrder).forEach(([nodeId, nodeData]) => {
    if (!nodeData.label || nodeData.label.trim().length === 0) {
      errors.push(`Step ${nodeId}: Label is required`)
    }

    if (!nodeData.templateStepId) {
      errors.push(`Step ${nodeId}: Template step ID is required`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}
