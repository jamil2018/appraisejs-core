import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion, qualityJourneyIdentifierSchema } from './contracts'

const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const browserEngine = z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).default('CHROMIUM')
const reason = z.string().trim().min(1).max(8_000)
const sortedIds = z
  .array(id)
  .min(1)
  .max(512)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length || values.some((value, index) => index && values[index - 1] >= value))
      context.addIssue({ code: 'custom', message: 'IDs must be unique and lexicographically sorted.' })
  })

const scoped = z.object({ journeyId: id, targetProjectId: id }).strict()
const mutation = z.object({ idempotencyKey: id }).strict()

export const qualityJourneyExecutionStartSchema = scoped
  .merge(mutation)
  .extend({
    preparedRuntimeCapsuleIds: sortedIds,
    environmentId: id,
    browserEngine,
    executionConsentId: id.optional(),
    expectedStateHash: digest,
  })
  .strict()

export const qualityJourneyExecutionReadSchema = scoped.extend({ cycleId: id.optional() }).strict()
export const qualityJourneyExecutionCancelSchema = scoped
  .merge(mutation)
  .extend({ cycleId: id.optional(), testRunIds: sortedIds.optional(), reason, expectedStateHash: digest })
  .strict()
export const qualityJourneyExecutionReconcileSchema = scoped.merge(mutation).extend({ cycleId: id }).strict()
export const qualityJourneyRerunProposalSchema = scoped
  .merge(mutation)
  .extend({ sourceCycleId: id, sourceEvidenceReceiptIds: sortedIds, selectedScenarioRevisionIds: sortedIds, reason })
  .strict()
export const qualityJourneyRerunApprovalSchema = scoped
  .extend({ proposalId: id, expectedProposalHash: digest, reason: reason.optional() })
  .strict()
export const qualityJourneyRerunStartSchema = scoped
  .merge(mutation)
  .extend({
    proposalId: id,
    environmentId: id,
    browserEngine,
    executionConsentId: id.optional(),
    expectedStateHash: digest,
  })
  .strict()
export const qualityJourneyExecutionConsentGrantSchema = scoped
  .extend({ executionConsentId: id, expectedScopeHash: digest })
  .strict()


export const qualityJourneyExecutionConsentScopeSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    checkpoint: z.string().min(1).max(200),
    targetProjectId: id,
    targetFingerprint: z.string().min(1).max(512),
    environmentSnapshotHash: digest,
    preparedRuntimeCapsuleIds: sortedIds,
    actions: z.array(z.string().min(1).max(200)).min(1).max(512),
    resourceHashes: z.record(z.string(), digest),
  })
  .strict()

/** Runtime remains out of the coordinator transaction. The durable cycle and
 * TestRun reservations are the only launch authority; adapter calls are safe
 * to retry because they receive their exact reserved identities. */
export type QualityJourneyExecutionRuntimeAdapter = {
  start(input: { executionCycleId: string }): Promise<void>
  cancel(input: { executionCycleId: string; testRunIds?: string[]; reason: string }): Promise<void>
  reconcile(input: { executionCycleId: string }): Promise<void>
}

export function hashQualityJourneyExecutionValue(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
