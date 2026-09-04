import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion, qualityJourneyIdentifierSchema, workerResultEnvelopeSchema } from './contracts'

const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const preparedRuntimeCapsuleSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    capsuleId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    materializationId: id,
    inputHash: digest,
    manifestHash: digest,
    status: z.literal('PREPARED'),
    // This is an explicit phase boundary. A managed RuntimeCapsule is created
    // only by Phase 7 with a TestRun binding.
    testRunId: z.never().optional(),
    runtimeCapsuleId: z.never().optional(),
  })
  .strict()

/** Durable target ownership proof.  It deliberately describes authored
 * content rather than generated IDs, so semantic reuse is bounded by a full
 * canonical packet and cannot become a name-only lookup. */
export const automationTargetBindingSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    targetProjectId: id,
    moduleId: id,
    suite: z.object({ id, name: z.string(), description: z.string().nullable() }).strict(),
    testCase: z
      .object({
        id,
        title: z.string(),
        description: z.string(),
        steps: z
          .array(
            z
              .object({
                order: z.number().int().nonnegative(),
                gherkinStep: z.string(),
                label: z.string(),
                icon: z.string(),
                invocationJson: z.string(),
              })
              .strict(),
          )
          .min(1)
          .max(128),
      })
      .strict(),
  })
  .strict()

const operationMappingSchema = z
  .object({
    id,
    version: z.string().min(1).max(64),
    handler: z.object({ id, version: z.string().min(1).max(64), contentHash: digest }).strict(),
  })
  .strict()
const parameterSchema = z
  .object({ name: z.string().min(1).max(200), type: z.string().min(1).max(100), value: z.unknown() })
  .strict()
const testDataRequirementSchema = z
  .object({ key: z.string().min(1).max(200), type: z.string().min(1).max(100), value: z.unknown() })
  .strict()
const locatorRequirementSchema = z
  .object({
    requirementId: id,
    parameterName: z.string().min(1).max(200),
    locatorId: id.optional(),
    runtimeParameter: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.locatorId && !value.runtimeParameter)
      context.addIssue({
        code: 'custom',
        message: 'A locator requirement needs a same-target locator or runtime parameter.',
      })
  })
const stepMaterializationSchema = z
  .object({
    sourceScenarioStepId: id,
    stepDefinition: z.object({ id, version: z.string().min(1).max(64), definitionHash: digest }).strict(),
    operation: operationMappingSchema,
    parameters: z.array(parameterSchema).max(128),
    testData: z.array(testDataRequirementSchema).max(128),
    locatorRequirements: z.array(locatorRequirementSchema).max(128),
  })
  .strict()
const automationScenarioMaterializationSchema = z
  .object({ scenarioRevisionId: id, steps: z.array(stepMaterializationSchema).min(1).max(128) })
  .strict()

export const automationMaterializationRequestSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    idempotencyKey: id,
    expectedInputHash: digest,
    expectedScopeHash: digest,
    scenarios: z.array(automationScenarioMaterializationSchema).min(1).max(512),
    result: workerResultEnvelopeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.scenarios.map(scenario => scenario.scenarioRevisionId)).size !== value.scenarios.length)
      context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario revisions must be unique.' })
    if (value.result.role !== 'AUTOMATOR')
      context.addIssue({
        code: 'custom',
        path: ['result', 'role'],
        message: 'Automator materialization requires the Automator role.',
      })
    if (value.result.status !== 'COMPLETED')
      context.addIssue({
        code: 'custom',
        path: ['result', 'status'],
        message: 'Automator materialization requires a completed worker result.',
      })
    if (value.result.outputs.some(output => !['TEST_SUITE', 'TEST_CASE', 'RUNTIME_CAPSULE'].includes(output.kind)))
      context.addIssue({
        code: 'custom',
        path: ['result', 'outputs'],
        message: 'Output artifact kind is forbidden for role.',
      })
  })

export function hashAutomationMaterialization(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

export function hashAutomationTargetBinding(value: unknown) {
  return hashAutomationMaterialization(automationTargetBindingSchema.parse(value))
}
