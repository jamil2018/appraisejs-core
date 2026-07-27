import { z } from 'zod'

import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { IconToKeyTransformer } from '@/lib/transformers/key-to-icon-transformer'
import type { ActionResponse } from '@/types/form/actionHandler'
import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { formatOrderedGherkinSteps } from '@/lib/gherkin-step-format'
import { flowFromNodeOrder } from '@/components/diagram/authored-flow-model'
import { normalizeAuthoredFlowBlocks } from '@/components/diagram/authored-flow-blocks'
import type { FlowBlock } from '@/types/diagram/diagram'

type ScenarioNodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap
type ScenarioNode = ScenarioNodeOrder[string]

export const testCaseSubmitSchema = testCaseSchema.extend({
  testSuiteIds: z.array(z.string()).min(1, { message: 'Test suites are required' }),
})

export const templateTestCaseSubmitSchema = templateTestCaseSchema

export const testCaseQuickTips = [
  {
    title: 'Provide a clear and descriptive title & description',
    description: 'Use clear, specific terms that indicate the purpose of the test scenario',
  },
  {
    title: 'Assign your test scenario to a test suite',
    description: 'Organize your test scenarios into test suites for better management and categorization',
  },
  {
    title: 'Add tags to your test scenario',
    description: 'Tags help filter and categorize your test scenarios for better organization and searchability',
  },
] as const

function normalizeStepParameters(parameters: ScenarioNode['parameters']) {
  return parameters.map(parameter => ({
    name: parameter.name,
    value: 'value' in parameter ? parameter.value : parameter.defaultValue,
    type: parameter.type,
    order: parameter.order,
  }))
}

export function buildScenarioSteps(nodeOrder: ScenarioNodeOrder) {
  return Object.entries(nodeOrder).map(([nodeId, value]) => ({
    nodeId: value.nodeId ?? nodeId,
    gherkinStep: value.gherkinStep || '',
    label: value.label,
    icon: IconToKeyTransformer(value.icon),
    parameters: normalizeStepParameters(value.parameters),
    order: value.order,
    invocation: value.invocation,
  }))
}

export function validateScenarioTopology(nodeOrder: ScenarioNodeOrder, flowBlocks: FlowBlock[]): string | undefined {
  try {
    const flow = flowFromNodeOrder(nodeOrder)
    const normalizedFlowBlocks = normalizeAuthoredFlowBlocks(flow, flowBlocks)
    if (JSON.stringify(normalizedFlowBlocks) !== JSON.stringify(flowBlocks)) {
      return 'Flow blocks must contain distinct, contiguous nodes from the authored flow.'
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'Authored flow topology is invalid.'
  }
  return undefined
}

export function buildScenarioPreview(title: string, description: string | undefined, nodeOrder: ScenarioNodeOrder) {
  if (!title) {
    return ''
  }

  const scenarioHeader = `Scenario: [${title}] ${description || ''}`
  const validSteps = Object.values(nodeOrder)
    .filter(step => step.order !== -1)
    .sort((left, right) => left.order - right.order)

  const gherkinSteps = formatOrderedGherkinSteps(validSteps, { resetWhenAfterThen: true })

  return [scenarioHeader, ...gherkinSteps].join('\n')
}

export function getNodesWithMissingMandatoryParams(nodeOrder: NodeOrderMap) {
  const nodesWithMissingParams: string[] = []

  Object.entries(nodeOrder).forEach(([nodeId, nodeData]) => {
    if (nodeData.order === -1) {
      return
    }

    const isMissingParams = Object.values(nodeData.invocation.inputs).some(value => value === '')

    if (isMissingParams) {
      nodesWithMissingParams.push(nodeData.label || nodeId)
    }
  })

  return nodesWithMissingParams
}

function getActionErrorMessage(response: ActionResponse) {
  return response.error || 'An error occurred'
}

export function handleTestCaseSaveResponse({
  response,
  redirectPath,
  push,
  toast,
}: {
  response: ActionResponse
  redirectPath: string
  push: (path: string) => void
  toast: (props: { title: string; description: string; variant: 'default' | 'destructive' }) => unknown
}) {
  if (response.status === 200) {
    toast({
      title: 'Success',
      description: 'Test case saved successfully',
      variant: 'default',
    })
    push(redirectPath)
  }

  if (response.status === 500) {
    toast({
      title: 'Error',
      description: getActionErrorMessage(response),
      variant: 'destructive',
    })
  }
}
