import { StepParameterType, TemplateStepIcon } from '@prisma/client'

import {
  canonicalStepDefinitionJson,
  stepInvocationSchema,
  validateStepInvocationInputs,
  type StepDefinition,
  type StepInvocation,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

export type AuthoredStep = {
  gherkinStep: string
  nodeId?: string
  label?: string
  icon?: string
  invocation: StepInvocation
  order: number
  parameters: Array<{ name: string; value: string; type: string; order: number }>
}

type FlowBlock = { id: string; name: string; nodeIds: string[] }

function exactDefinitionForAuthoredStep(step: AuthoredStep, definitions: StepDefinition[]) {
  const definition = definitions.find(
    candidate =>
      candidate.identity.id === step.invocation.step.id && candidate.identity.version === step.invocation.step.version,
  )
  if (!definition) throw new Error(`Step ${step.invocation.step.id} is not available for authored persistence.`)
  return definition
}

function authoredStepBase(step: AuthoredStep, definitions: StepDefinition[]) {
  const invocation = stepInvocationSchema.parse(step.invocation)
  validateStepInvocationInputs(exactDefinitionForAuthoredStep(step, definitions), invocation.inputs)
  return {
    gherkinStep: step.gherkinStep,
    flowNodeId: step.nodeId,
    label: step.label ?? '',
    icon: (step.icon ?? '') as TemplateStepIcon,
    invocationJson: canonicalStepDefinitionJson(invocation),
    order: step.order,
  }
}

export function testCaseStepCreates(steps: AuthoredStep[], definitions: StepDefinition[]) {
  return steps.map(step => ({
    ...authoredStepBase(step, definitions),
    parameters: {
      create: step.parameters.map(parameter => ({
        name: parameter.name,
        value: parameter.value,
        type: parameter.type as StepParameterType,
        order: parameter.order,
      })),
    },
  }))
}

export function templateTestCaseStepCreates(steps: AuthoredStep[], definitions: StepDefinition[]) {
  return steps.map(step => ({
    ...authoredStepBase(step, definitions),
    parameters: {
      create: step.parameters.map(parameter => ({
        name: parameter.name,
        defaultValue: parameter.value,
        type: parameter.type as StepParameterType,
        order: parameter.order,
      })),
    },
  }))
}

export function stepBlockStepCreates(
  steps: Array<{ invocation: StepInvocation; order: number }>,
  definitions: StepDefinition[],
) {
  return steps.map(step => {
    const invocation = stepInvocationSchema.parse(step.invocation)
    const definition = definitions.find(
      candidate =>
        candidate.identity.id === invocation.step.id && candidate.identity.version === invocation.step.version,
    )
    if (!definition) throw new Error(`Step ${invocation.step.id} is not available for authored persistence.`)
    validateStepInvocationInputs(definition, invocation.inputs)
    const invocationJson = canonicalStepDefinitionJson(invocation)
    const parameterMap = canonicalStepDefinitionJson(invocation.inputs)
    return {
      order: step.order,
      invocationJson,
      parameterMap,
    }
  })
}

export function flowBlockCreates(flowBlocks: FlowBlock[] = []) {
  return flowBlocks.map((block, order) => ({
    id: block.id,
    name: block.name,
    order,
    nodes: { create: block.nodeIds.map(flowNodeId => ({ flowNodeId })) },
  }))
}
