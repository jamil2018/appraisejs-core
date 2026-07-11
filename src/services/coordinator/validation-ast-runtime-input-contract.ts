import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import { assertSafeGeneratedGherkin } from '@/lib/validation-ast/gherkin-safety'
import { assertValidCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const boundedId = z.string().min(1).max(256)

const descriptorSchema = z.object({ id: boundedId, version: boundedId, contentHash: hashSchema }).strict()

const validationAstRuntimeInputV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    targetProjectId: boundedId,
    targetFingerprint: hashSchema,
    astId: boundedId,
    astHash: hashSchema,
    contextHash: hashSchema,
    previewHash: hashSchema,
    receiptHash: hashSchema,
    compilerReceipt: z
      .object({
        schemaVersion: z.literal('1'),
        catalogHash: hashSchema,
        locatorGraphHash: hashSchema,
        environments: z.array(boundedId).max(64),
        browsers: z.array(boundedId).max(16),
        runtimes: z.array(boundedId).max(16),
        contentHash: hashSchema,
      })
      .strict(),
    extensionPolicy: z
      .object({
        version: z.literal('1'),
        projectId: boundedId,
        projectFingerprint: hashSchema,
        capabilityImports: z.record(z.string(), z.array(boundedId)),
        compilerVersion: boundedId,
        declarationHash: hashSchema,
        contentHash: hashSchema,
      })
      .strict(),
    actions: z.array(descriptorSchema).min(1).max(512),
    locators: z
      .array(
        descriptorSchema.extend({
          binding: z
            .object({ id: boundedId, name: boundedId, value: z.string().min(1).max(4096), locatorGroupId: boundedId })
            .strict(),
        }),
      )
      .max(512),
    extensions: z
      .array(
        z
          .object({
            id: boundedId,
            version: boundedId,
            sourceHash: hashSchema,
            compiledHash: hashSchema,
            artifactHash: hashSchema,
          })
          .strict(),
      )
      .max(8),
    matrix: z
      .array(z.object({ browser: boundedId, environment: boundedId }).strict())
      .min(1)
      .max(64),
    expected: z
      .object({
        scenarios: z
          .array(
            z
              .object({ scenarioId: boundedId, caseId: boundedId, stepIds: z.array(boundedId).min(1).max(512) })
              .strict(),
          )
          .min(1)
          .max(512),
        scenarioCount: z.number().int().positive().max(512),
      })
      .strict(),
    gherkinHash: hashSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.expected.scenarioCount !== value.expected.scenarios.length)
      context.addIssue({ code: 'custom', path: ['expected', 'scenarioCount'], message: 'must equal scenarios length' })
    for (const [key, values] of [
      ['locators', value.locators.map(item => `${item.id}@${item.version}`)],
      ['extensions', value.extensions.map(item => `${item.id}@${item.version}`)],
      ['scenarios', value.expected.scenarios.map(item => item.scenarioId)],
      ['cases', value.expected.scenarios.map(item => item.caseId)],
    ] as const)
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', path: [key], message: 'identities must be unique' })
  })

export type ValidationAstRuntimeInputV1 = z.infer<typeof validationAstRuntimeInputV1Schema>

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

export function validationAstPublishOperationId(receiptHash: string): string {
  return `astpub_${hashSchema.parse(receiptHash).slice('sha256:'.length)}`
}

export function validateValidationAstRuntimeInput(input: {
  operation: Record<string, unknown>
  projectionJson: string
  extensionReviews: Array<{
    extensionId: string
    version: string
    sourceHash: string
    compiledHash: string
    artifactHash: string
  }>
}): ValidationAstRuntimeInputV1 {
  let runtimeInput: ValidationAstRuntimeInputV1
  let projection: {
    validationNode?: {
      id?: string
      matrix?: unknown
      testCaseIds?: string[]
      appraiseArtifacts?: {
        testCases?: Array<{ id?: string; steps?: Array<{ id?: string; templateStepName?: string }> }>
        locators?: unknown
      }
    }
    gherkin?: unknown
  }
  try {
    const runtimeInputJson = input.operation.runtimeInputJson as string
    runtimeInput = validationAstRuntimeInputV1Schema.parse(JSON.parse(runtimeInputJson))
    assertValidCustomExtensionPolicy(runtimeInput.extensionPolicy)
    if (canonicalContractJson(runtimeInput) !== runtimeInputJson)
      throw new Error('Runtime input is not canonical JSON.')
    projection = JSON.parse(input.projectionJson)
    assertSafeGeneratedGherkin(projection.gherkin)
  } catch {
    throw new ServiceError('Stored Validation AST runtime input is invalid.', 'CONFLICT')
  }
  const operationChecks = [
    [runtimeInput.targetProjectId, input.operation.targetProjectId],
    [runtimeInput.targetFingerprint, input.operation.targetFingerprint],
    [runtimeInput.extensionPolicy.projectId, input.operation.targetProjectId],
    [runtimeInput.extensionPolicy.projectFingerprint, input.operation.targetFingerprint],
    [runtimeInput.astId, input.operation.astId],
    [runtimeInput.astHash, input.operation.astHash],
    [runtimeInput.contextHash, input.operation.contextHash],
    [runtimeInput.previewHash, input.operation.previewHash],
    [runtimeInput.receiptHash, input.operation.receiptHash],
    [validationAstPublishOperationId(runtimeInput.receiptHash), input.operation.id],
    [digest(runtimeInput), input.operation.runtimeInputHash],
    [runtimeInput.astId, projection.validationNode?.id],
    [runtimeInput.gherkinHash, digest(projection.gherkin)],
  ]
  if (operationChecks.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Stored Validation AST runtime input does not match its publish operation.', 'CONFLICT')

  const { contentHash: compilerReceiptHash, ...compilerReceipt } = runtimeInput.compilerReceipt
  if (digest(compilerReceipt) !== compilerReceiptHash)
    throw new ServiceError('Stored Validation AST compiler receipt hash is invalid.', 'CONFLICT')

  const projectedCases = projection.validationNode?.appraiseArtifacts?.testCases ?? []
  const expectedCases = runtimeInput.expected.scenarios.map(item => item.caseId)
  const projectedActions = projectedCases.flatMap(testCase => (testCase.steps ?? []).map(step => step.templateStepName))
  const expectedActions = runtimeInput.actions.map(action => `${action.id}@${action.version}`)
  const projectedStepIds = projectedCases.map(testCase => (testCase.steps ?? []).map(step => step.id))
  const expectedStepIds = runtimeInput.expected.scenarios.map(scenario => scenario.stepIds)
  const projectedLocators = [
    ...((projection.validationNode?.appraiseArtifacts?.locators as Array<{ id: string }> | undefined) ?? []),
  ].sort((left, right) => left.id.localeCompare(right.id))
  const mismatchChecks = [
    ['matrix', runtimeInput.matrix, projection.validationNode?.matrix],
    [
      'locators',
      runtimeInput.locators.map(item => item.binding).sort((a, b) => a.id.localeCompare(b.id)),
      projectedLocators,
    ],
    ['cases', expectedCases, projection.validationNode?.testCaseIds],
    ['actions', expectedActions, projectedActions],
    ['steps', expectedStepIds, projectedStepIds],
  ] as const
  const projectionMismatch = mismatchChecks.find(
    ([, expected, actual]) => canonicalContractJson(expected) !== canonicalContractJson(actual),
  )?.[0]
  if (projectionMismatch)
    throw new ServiceError(
      `Stored Validation AST runtime input ${projectionMismatch} do not match its projection.`,
      'CONFLICT',
    )

  const extensions = [...input.extensionReviews]
    .map(review => ({
      id: review.extensionId,
      version: review.version,
      sourceHash: review.sourceHash,
      compiledHash: review.compiledHash,
      artifactHash: review.artifactHash,
    }))
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
  if (canonicalContractJson(runtimeInput.extensions) !== canonicalContractJson(extensions))
    throw new ServiceError(
      'Stored Validation AST runtime input extension references do not match review evidence.',
      'CONFLICT',
    )
  return runtimeInput
}
