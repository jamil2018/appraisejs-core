import {
  canonicalOperationJson,
  operationContentHash,
  operationInvocationSchema,
} from '../../../packages/cucumber-runtime/src/operations'

export type CanonicalTemplateStepMapping = {
  operationId: string | null
  operationVersion: string | null
  operationDescriptorHash: string | null
  humanProjectionId: string | null
  operationMigrationState: string | null
}

export type AuthoredStepValue = {
  gherkinStep: string
  parameters: Array<{ name: string; value: string }>
}

export type StepBlockOperationTemplate = CanonicalTemplateStepMapping & {
  signature: string
  parameters: Array<{ name: string }>
}

export function isMappedOperationTemplate(
  mapping: CanonicalTemplateStepMapping | undefined,
): mapping is CanonicalTemplateStepMapping & Required<CanonicalTemplateStepMapping> {
  return Boolean(
    mapping?.operationMigrationState === 'mapped' &&
      mapping.operationId &&
      mapping.operationVersion &&
      mapping.operationDescriptorHash &&
      mapping.humanProjectionId,
  )
}

export function buildCanonicalInvocationJson(
  mapping: CanonicalTemplateStepMapping | undefined,
  step: AuthoredStepValue,
): string | null {
  if (!isMappedOperationTemplate(mapping)) return null
  const [keyword, ...description] = step.gherkinStep.trim().split(/\s+/)
  const invocation = operationInvocationSchema.parse({
    operation: {
      id: mapping.operationId,
      version: mapping.operationVersion,
      descriptorHash: mapping.operationDescriptorHash,
    },
    inputs: Object.fromEntries(
      [...step.parameters]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(parameter => [parameter.name, parameter.value]),
    ),
    presentation: {
      keyword: ['Given', 'When', 'Then', 'And'].includes(keyword!) ? keyword : 'When',
      description: description.join(' ') || step.gherkinStep,
      humanProjectionId: mapping.humanProjectionId,
    },
  })
  return canonicalOperationJson(invocation)
}

export function buildCanonicalStepBlockOperation(template: StepBlockOperationTemplate): {
  parameterMap: string
  operationInvocationJson: string
  compositionVersionHash: string
} | null {
  if (!isMappedOperationTemplate(template)) return null
  const parameterMap = canonicalOperationJson(
    Object.fromEntries(template.parameters.map(parameter => [parameter.name, parameter.name])),
  )
  const operationInvocationJson = canonicalOperationJson(
    operationInvocationSchema.parse({
      operation: {
        id: template.operationId,
        version: template.operationVersion,
        descriptorHash: template.operationDescriptorHash,
      },
      inputs: Object.fromEntries(
        template.parameters.map(parameter => [parameter.name, { $parameter: parameter.name }]),
      ),
      presentation: {
        keyword: 'When',
        description: template.signature,
        humanProjectionId: template.humanProjectionId,
      },
    }),
  )
  return {
    parameterMap,
    operationInvocationJson,
    compositionVersionHash: operationContentHash({ operationInvocationJson, parameterMap }),
  }
}
