import { type TemplateStepParameter } from '@prisma/client'
import { z } from 'zod'

import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { checkMissingMandatoryParams } from '@/lib/utils/node-param-validation'
import { IconToKeyTransformer } from '@/lib/transformers/key-to-icon-transformer'
import type { ActionResponse } from '@/types/form/actionHandler'
import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

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
  return Object.entries(nodeOrder).map(([, value]) => ({
    gherkinStep: value.gherkinStep || '',
    label: value.label,
    icon: IconToKeyTransformer(value.icon),
    parameters: normalizeStepParameters(value.parameters),
    order: value.order,
    templateStepId: value.templateStepId,
  }))
}

export function buildScenarioPreview(
  title: string,
  description: string | undefined,
  nodeOrder: ScenarioNodeOrder,
) {
  if (!title) {
    return ''
  }

  const scenarioHeader = `Scenario: [${title}] ${description || ''}`
  const validSteps = Object.values(nodeOrder)
    .filter(step => step.order !== -1)
    .sort((left, right) => left.order - right.order)

  let hasThenInPrevious = false
  let hasWhenInPrevious = false

  const gherkinSteps = validSteps.map((step, index) => {
    const gherkinStep = step.gherkinStep?.trim() || ''
    const firstWord = gherkinStep.split(' ')[0].toLowerCase()
    const hasGherkinKeyword = ['given', 'when', 'then', 'and', 'but'].includes(firstWord)
    const stepWithoutKeyword = hasGherkinKeyword ? gherkinStep.split(' ').slice(1).join(' ') : gherkinStep

    if (index === 0) {
      return `Given ${stepWithoutKeyword}`
    }

    const isThenStatement =
      firstWord === 'then' ||
      stepWithoutKeyword.toLowerCase().startsWith('should') ||
      stepWithoutKeyword.toLowerCase().startsWith('must') ||
      stepWithoutKeyword.toLowerCase().startsWith('will')

    if (!hasThenInPrevious) {
      if (isThenStatement) {
        hasThenInPrevious = true
        return `Then ${stepWithoutKeyword}`
      }

      if (!hasWhenInPrevious) {
        hasWhenInPrevious = true
        return `When ${stepWithoutKeyword}`
      }

      return `And ${stepWithoutKeyword}`
    }

    if (isThenStatement) {
      return `And ${stepWithoutKeyword}`
    }

    hasThenInPrevious = false
    hasWhenInPrevious = false
    return `When ${stepWithoutKeyword}`
  })

  return [scenarioHeader, ...gherkinSteps].join('\n')
}

export function getNodesWithMissingMandatoryParams(
  nodeOrder: NodeOrderMap,
  templateStepParams: TemplateStepParameter[],
) {
  const nodesWithMissingParams: string[] = []

  Object.entries(nodeOrder).forEach(([nodeId, nodeData]) => {
    if (nodeData.order === -1) {
      return
    }

    const isMissingParams = checkMissingMandatoryParams(
      {
        parameters: normalizeStepParameters(nodeData.parameters),
        templateStepId: nodeData.templateStepId,
      },
      templateStepParams,
      false,
    )

    if (isMissingParams) {
      nodesWithMissingParams.push(nodeData.label || nodeId)
    }
  })

  return nodesWithMissingParams
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || 'An error occurred'
}
