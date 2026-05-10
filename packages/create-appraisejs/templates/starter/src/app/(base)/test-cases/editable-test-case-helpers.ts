import type {
  TestCase,
  TestCaseFlowBlock,
  TestCaseFlowBlockNode,
  TestCaseStep,
  TestCaseStepParameter,
} from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'

export type EditableTestCase = TestCase & {
  steps: (TestCaseStep & { parameters: TestCaseStepParameter[] })[]
  flowBlocks?: (TestCaseFlowBlock & { nodes: TestCaseFlowBlockNode[] })[]
  testSuiteIds: string[]
  tagIds: string[]
}

function isTestCaseStepParameterRow(value: unknown): value is TestCaseStepParameter {
  return typeof value === 'object' && value !== null && 'name' in value && 'value' in value && 'type' in value
}

function isTestCaseStepRow(value: unknown): value is TestCaseStep & { parameters: TestCaseStepParameter[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value &&
    'templateStepId' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTestCaseStepParameterRow)
  )
}

function isEditableTestCase(value: unknown): value is EditableTestCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    'steps' in value &&
    Array.isArray(value.steps) &&
    value.steps.every(isTestCaseStepRow) &&
    'testSuiteIds' in value &&
    Array.isArray(value.testSuiteIds) &&
    'tagIds' in value &&
    Array.isArray(value.tagIds)
  )
}

export function getEditableTestCase(data: ActionResponseData | undefined) {
  return isEditableTestCase(data) ? data : null
}

export function buildNodeOrderFromTestCaseSteps(steps: EditableTestCase['steps']): NodeOrderMap {
  return steps.reduce<NodeOrderMap>((acc, step) => {
    const nodeId = step.flowNodeId ?? step.id
    acc[nodeId] = {
      nodeId,
      order: step.order,
      label: step.label,
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      parameters: (step.parameters || []).map(parameter => ({
        name: parameter.name,
        value: parameter.value,
        type: parameter.type,
        order: parameter.order,
      })),
      templateStepId: step.templateStepId,
    }
    return acc
  }, {})
}

export function buildFlowBlocksFromTestCaseRows(flowBlocks: EditableTestCase['flowBlocks'] = []): FlowBlock[] {
  return flowBlocks
    .slice()
    .sort((left, right) => left.order - right.order)
    .map(block => ({
      id: block.id,
      name: block.name,
      nodeIds: block.nodes.map(node => node.flowNodeId),
    }))
}
