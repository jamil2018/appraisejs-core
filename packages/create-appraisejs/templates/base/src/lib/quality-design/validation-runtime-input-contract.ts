import { createHash } from 'node:crypto'

import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { assertSafeGeneratedGherkin } from '@/lib/validation-ast/gherkin-safety'
import { assertValidCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { ServiceError } from '@/services/shared/errors'
import {
  stepInvocationSchema,
  stepReferenceSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z.string().min(1).max(256)
const descriptor = z.object({ id, version: id, contentHash: hash }).strict()
const projectionSchema = z
  .object({
    gherkin: z.unknown(),
    validationNode: z
      .object({
        id: z.string().optional(),
        matrix: z.unknown().optional(),
        testCaseIds: z.array(z.string()).optional(),
        appraiseArtifacts: z
          .object({
            testCases: z
              .array(
                z.object({
                  id: z.string().optional(),
                  steps: z.array(z.object({ id: z.string().optional(), invocation: z.unknown() })).optional(),
                }),
              )
              .optional(),
            locators: z.array(z.object({ id: z.string() }).passthrough()).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough()

const runtimeInputSchema = z
  .object({
    schemaVersion: z.literal('2'),
    targetProjectId: id,
    targetFingerprint: hash,
    astId: id,
    astHash: hash,
    contextHash: hash,
    previewHash: hash,
    receiptHash: hash,
    lifecycleCorrelation: z.object({ qualityPlanId: id, correlationId: id }).strict().optional(),
    compilerReceipt: z
      .object({
        schemaVersion: z.literal('1'),
        catalogHash: hash,
        locatorGraphHash: hash,
        environments: z.array(id).max(64),
        browsers: z.array(id).max(16),
        runtimes: z.array(id).max(16),
        contentHash: hash,
      })
      .strict(),
    extensionPolicy: z
      .object({
        version: z.literal('1'),
        projectId: id,
        projectFingerprint: hash,
        capabilityImports: z.record(z.string(), z.array(id)),
        compilerVersion: id,
        declarationHash: hash,
        contentHash: hash,
      })
      .strict(),
    rootInvocations: z
      .array(z.object({ caseId: id, stepId: id, invocation: stepInvocationSchema }).strict())
      .min(1)
      .max(512),
    stepDefinitions: z.array(stepReferenceSchema).min(1).max(512),
    locators: z
      .array(
        descriptor.extend({
          binding: z.object({ id, name: id, value: z.string().min(1).max(4096), locatorGroupId: id }).strict(),
        }),
      )
      .max(512),
    extensions: z
      .array(z.object({ id, version: id, sourceHash: hash, compiledHash: hash, artifactHash: hash }).strict())
      .max(8),
    matrix: z
      .array(z.object({ browser: id, environment: id }).strict())
      .min(1)
      .max(64),
    expected: z
      .object({
        scenarios: z
          .array(z.object({ scenarioId: id, caseId: id, stepIds: z.array(id).min(1).max(512) }).strict())
          .min(1)
          .max(512),
        scenarioCount: z.number().int().positive().max(512),
      })
      .strict(),
    gherkinHash: hash,
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

export type ValidationAstRuntimeInput = z.infer<typeof runtimeInputSchema>
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const qualityValidationPublicationId = (receiptHash: string) =>
  `astpub_${hash.parse(receiptHash).slice('sha256:'.length)}`

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
}): ValidationAstRuntimeInput {
  let runtimeInput: ValidationAstRuntimeInput
  let projection: z.infer<typeof projectionSchema>
  try {
    const runtimeInputJson = input.operation.runtimeInputJson as string
    runtimeInput = runtimeInputSchema.parse(JSON.parse(runtimeInputJson))
    assertValidCustomExtensionPolicy(runtimeInput.extensionPolicy)
    if (canonicalContractJson(runtimeInput) !== runtimeInputJson)
      throw new Error('Runtime input is not canonical JSON.')
    projection = projectionSchema.parse(JSON.parse(input.projectionJson))
    assertSafeGeneratedGherkin(projection.gherkin)
  } catch {
    throw new ServiceError('Stored Quality validation runtime input is invalid.', 'CONFLICT')
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
    [qualityValidationPublicationId(runtimeInput.receiptHash), input.operation.id],
    [digest(runtimeInput), input.operation.runtimeInputHash],
    [runtimeInput.astId, projection.validationNode?.id],
    [runtimeInput.gherkinHash, digest(projection.gherkin)],
  ]
  if (operationChecks.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Stored Quality validation runtime input does not match its publication.', 'CONFLICT')
  const { contentHash, ...compilerReceipt } = runtimeInput.compilerReceipt
  if (digest(compilerReceipt) !== contentHash)
    throw new ServiceError('Stored Quality validation compiler receipt hash is invalid.', 'CONFLICT')
  const projectedCases = projection.validationNode?.appraiseArtifacts?.testCases ?? []
  const projectedInvocations = projectedCases.flatMap(testCase =>
    (testCase.steps ?? []).map(step => ({
      caseId: testCase.id,
      stepId: step.id,
      invocation: stepInvocationSchema.parse(step.invocation),
    })),
  )
  const projectedDefinitions = [
    ...new Map(
      projectedInvocations.map(item => [
        `${item.invocation.step.id}@${item.invocation.step.version}#${item.invocation.step.definitionHash}`,
        item.invocation.step,
      ]),
    ).values(),
  ].sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
  const projectedLocators = [...(projection.validationNode?.appraiseArtifacts?.locators ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  const comparisons = [
    [runtimeInput.matrix, projection.validationNode?.matrix],
    [
      runtimeInput.locators.map(item => item.binding).sort((left, right) => left.id.localeCompare(right.id)),
      projectedLocators,
    ],
    [runtimeInput.expected.scenarios.map(item => item.caseId), projection.validationNode?.testCaseIds],
    [runtimeInput.rootInvocations, projectedInvocations],
    [runtimeInput.stepDefinitions, projectedDefinitions],
    [
      runtimeInput.expected.scenarios.map(item => item.stepIds),
      projectedCases.map(testCase => (testCase.steps ?? []).map(step => step.id)),
    ],
  ]
  if (comparisons.some(([expected, actual]) => canonicalContractJson(expected) !== canonicalContractJson(actual)))
    throw new ServiceError('Stored Quality validation runtime input does not match its projection.', 'CONFLICT')
  const extensions = input.extensionReviews
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
      'Stored Quality validation runtime input extension references do not match review evidence.',
      'CONFLICT',
    )
  return runtimeInput
}
