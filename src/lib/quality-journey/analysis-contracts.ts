import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion } from './contracts'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const text = z.string().trim().min(1).max(8_000)

const uniqueIds =
  <T extends { [key: string]: unknown }>(key: keyof T, message: string) =>
  (values: readonly T[], context: z.RefinementCtx) => {
    const ids = values.map(value => value[key])
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message })
  }

const analysisQuestionPayloadSchema = z
  .object({ questionId: id, prompt: text, required: z.boolean(), rationale: text })
  .strict()

const requirementSchema = z
  .object({ requirementId: id, statement: text, sourceRefs: z.array(text).min(1).max(64) })
  .strict()
const obligationSchema = z
  .object({ obligationId: id, requirementId: id, statement: text, acceptanceSignals: z.array(text).min(1).max(64) })
  .strict()

/** The Analyzer's immutable charter payload. Requirement IDs are caller-stable
 * identifiers and are deliberately separate from content hashes/revision IDs. */
export const analysisCharterSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    charterId: id,
    analysisRevisionId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    requirementRevisionId: id,
    objectives: z.array(text).min(1).max(64),
    scope: z.object({ included: z.array(text).min(1).max(128), excluded: z.array(text).max(128) }).strict(),
    actors: z.array(text).max(128),
    requirements: z.array(requirementSchema).min(1).max(512),
    obligations: z.array(obligationSchema).min(1).max(512),
    constraints: z.array(text).max(256),
    assumptions: z.array(text).max(256),
    risks: z.array(text).max(256),
    acceptanceSignals: z.array(text).min(1).max(256),
    retiredRequirementIds: z.array(id).max(512),
    questions: z.array(analysisQuestionPayloadSchema).max(256),
    resolvedQuestionAnswerIds: z.array(id).max(256),
  })
  .strict()
  .superRefine((charter, context) => {
    uniqueIds('requirementId', 'Requirement IDs must be unique.')(charter.requirements, context)
    uniqueIds('obligationId', 'Obligation IDs must be unique.')(charter.obligations, context)
    uniqueIds('questionId', 'Question IDs must be unique.')(charter.questions, context)
    const requirementIds = new Set(charter.requirements.map(requirement => requirement.requirementId))
    if (charter.obligations.some(obligation => !requirementIds.has(obligation.requirementId)))
      context.addIssue({
        code: 'custom',
        path: ['obligations'],
        message: 'Every obligation must reference a stable requirement ID.',
      })
    if (new Set(charter.resolvedQuestionAnswerIds).size !== charter.resolvedQuestionAnswerIds.length)
      context.addIssue({
        code: 'custom',
        path: ['resolvedQuestionAnswerIds'],
        message: 'Resolved answer IDs must be unique.',
      })
    if (new Set(charter.retiredRequirementIds).size !== charter.retiredRequirementIds.length)
      context.addIssue({
        code: 'custom',
        path: ['retiredRequirementIds'],
        message: 'Retired requirement IDs must be unique.',
      })
    if (charter.requirements.some(requirement => charter.retiredRequirementIds.includes(requirement.requirementId)))
      context.addIssue({
        code: 'custom',
        path: ['retiredRequirementIds'],
        message: 'A current requirement cannot be retired.',
      })
  })

export const analysisSubmissionSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1).max(2_000),
    idempotencyKey: id,
    predecessorAnalysisRevisionId: id.optional(),
    charter: analysisCharterSchema,
  })
  .strict()

export const analysisAnswerSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    answerId: id,
    journeyId: id,
    targetProjectId: id,
    analysisRevisionId: id,
    questionId: id,
    answer: text,
    actor: z.literal('USER'),
    correctionOfAnswerId: id.optional(),
  })
  .strict()

export const analysisAnswerRequestSchema = z.object({ idempotencyKey: id, answer: analysisAnswerSchema }).strict()

const specializedAnalysisLifecycleCommands = [
  'PUBLISH_ANALYSIS',
  'REQUEST_ANALYSIS_REVISION',
  'DECIDE_ANALYSIS',
] as const

export function isSpecializedAnalysisLifecycleCommand(command: unknown): boolean {
  return typeof command === 'string' && specializedAnalysisLifecycleCommands.includes(command as never)
}

export function hashAnalysisCharter(value: unknown): string {
  return hashCanonical(analysisCharterSchema.parse(value))
}

export function hashAnalysisQuestion(value: unknown): string {
  return hashCanonical(analysisQuestionPayloadSchema.parse(value))
}

export function hashAnalysisAnswer(value: unknown): string {
  return hashCanonical(analysisAnswerSchema.parse(value))
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
