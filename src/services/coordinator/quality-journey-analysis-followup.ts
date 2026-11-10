import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'

const identity = z.string().min(1)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const reference = z
  .object({ kind: identity, artifactId: identity, revisionId: identity.optional(), contentHash: digest })
  .strict()
const question = z
  .object({ questionId: identity, required: z.boolean(), question: reference, answer: reference.nullable() })
  .strict()
const analysisFollowupDescriptorSchema = z
  .object({
    schemaVersion: z.literal('appraise.analysis-followup-descriptor/v1'),
    journeyId: identity,
    targetProjectId: identity,
    cycleId: identity,
    workItemId: identity,
    predecessor: z
      .object({
        revisionId: identity,
        artifact: reference,
        attemptId: identity,
        authorizationId: identity,
        inputHash: digest,
      })
      .strict(),
    requirement: reference,
    questions: z.array(question),
    feedback: z.object({ commandId: identity, artifact: reference }).strict().nullable(),
    cause: z.object({ eventId: identity, sequence: z.number().int().positive() }).strict(),
    advisoryInputRefs: z.array(z.unknown()),
    advisoryDigest: digest,
    roleContractDigest: digest,
  })
  .strict()
export type AnalysisFollowupDescriptorV1 = z.infer<typeof analysisFollowupDescriptorSchema>
const analysisFollowupIssuanceSchema = z
  .object({
    schemaVersion: z.literal('appraise.analysis-followup-issuance/v1'),
    descriptor: analysisFollowupDescriptorSchema,
    causeHash: digest,
    inputHash: digest,
    workItemId: identity,
    authorizationId: identity,
    issuedWorkItemVersion: z.number().int().nonnegative(),
  })
  .strict()
export type AnalysisFollowupIssuanceV1 = z.infer<typeof analysisFollowupIssuanceSchema>
export const analysisFollowupExpectedWorkSchema = z
  .object({
    workItemId: identity,
    cycleId: identity,
    version: z.number().int().nonnegative(),
    inputHash: digest,
    authorizationId: identity,
    causeHash: digest,
  })
  .strict()
export type AnalysisFollowupExpectedWork = z.infer<typeof analysisFollowupExpectedWorkSchema>

/** Pure content compiler. The caller must authenticate every snapshot fact transactionally. */
export function compileAnalysisFollowupDescriptor(snapshot: AnalysisFollowupDescriptorV1) {
  const descriptor = analysisFollowupDescriptorSchema.parse(snapshot)
  descriptor.questions.sort((a, b) => a.questionId.localeCompare(b.questionId))
  descriptor.advisoryInputRefs.sort((a, b) => canonicalContractJson(a).localeCompare(canonicalContractJson(b)))
  if (new Set(descriptor.questions.map(q => q.questionId)).size !== descriptor.questions.length)
    throw new ServiceError('Analysis follow-up has ambiguous question identity.', 'CONFLICT')
  if (hashCanonical(descriptor.advisoryInputRefs) !== descriptor.advisoryDigest)
    throw new ServiceError('Analysis follow-up advisory digest is invalid.', 'CONFLICT')
  if (
    descriptor.requirement.kind !== 'JOURNEY_REVISION' ||
    descriptor.requirement.revisionId !== descriptor.requirement.artifactId ||
    descriptor.predecessor.artifact.kind !== 'ANALYSIS_CHARTER_REVISION' ||
    descriptor.predecessor.artifact.revisionId !== descriptor.predecessor.revisionId ||
    descriptor.questions.some(
      q =>
        q.question.kind !== 'ANALYSIS_QUESTION' ||
        q.question.artifactId !== q.questionId ||
        q.question.revisionId !== descriptor.predecessor.revisionId ||
        (q.answer !== null && q.answer.kind !== 'ANALYSIS_ANSWER'),
    ) ||
    (descriptor.feedback !== null &&
      (descriptor.feedback.artifact.kind !== 'ANALYSIS_REVISION_FEEDBACK' ||
        descriptor.feedback.artifact.revisionId !== descriptor.predecessor.revisionId))
  )
    throw new ServiceError(
      'Analysis follow-up artifact references do not bind the exact predecessor and requirement.',
      'CONFLICT',
    )
  const inputArtifacts = [
    descriptor.requirement,
    descriptor.predecessor.artifact,
    ...descriptor.questions.flatMap(q => [q.question, ...(q.answer ? [q.answer] : [])]),
    ...(descriptor.feedback ? [descriptor.feedback.artifact] : []),
  ].sort((a, b) => canonicalContractJson(a).localeCompare(canonicalContractJson(b)))
  return {
    descriptor,
    causeHash: hashCanonical({ schemaVersion: 'appraise.analysis-followup-cause/v1', descriptor }),
    inputHash: hashCanonical(descriptor),
    inputArtifacts,
    ready: descriptor.questions.every(q => !q.required || q.answer !== null),
  }
}

export function validateAnalysisFollowupIssuance(value: unknown) {
  const issuance = analysisFollowupIssuanceSchema.parse(value)
  const compiled = compileAnalysisFollowupDescriptor(issuance.descriptor)
  if (
    !compiled.ready ||
    compiled.inputHash !== issuance.inputHash ||
    compiled.causeHash !== issuance.causeHash ||
    issuance.workItemId !== issuance.descriptor.workItemId
  )
    throw new ServiceError('Analysis follow-up issuance content is invalid.', 'CONFLICT')
  return { ...compiled, issuance }
}

/** Recorded authorization family only; scope/content validation still belongs to selectAnalysisFollowupIssuance. */
export function analysisFollowupIssuancePayloadsForAuthorization(
  payloads: readonly unknown[],
  authorizationId: string,
) {
  return payloads.filter(
    value =>
      typeof value === 'object' &&
      value !== null &&
      'authorizationId' in value &&
      value.authorizationId === authorizationId,
  )
}

/** Shared event codec. Database readers select scope; no timestamp/newest arbitration. */
export function selectAnalysisFollowupIssuance(
  payloads: readonly unknown[],
  scope: { journeyId: string; targetProjectId: string; workItemId: string; authorizationId: string },
) {
  const matches = analysisFollowupIssuancePayloadsForAuthorization(payloads, scope.authorizationId)
  if (matches.length !== 1) throw new ServiceError('Managed Analysis follow-up issuance requires recovery.', 'CONFLICT')
  const compiled = validateAnalysisFollowupIssuance(matches[0])
  if (
    compiled.issuance.workItemId !== scope.workItemId ||
    compiled.descriptor.journeyId !== scope.journeyId ||
    compiled.descriptor.targetProjectId !== scope.targetProjectId
  )
    throw new ServiceError('Managed Analysis follow-up issuance scope is invalid.', 'CONFLICT')
  return compiled
}

/** Existing policy ceilings are supplied by the canonical caller, never by an external request. */
export function assertAnalysisFollowupAttemptBudget(input: {
  authorizationAttempts: number
  authorizationMaxAttempts: number
  lifetimeAttempts: number
  currentAttempt: number
  maxAttempts: number
}) {
  if (
    Object.values(input).some(n => !Number.isSafeInteger(n) || n < 0) ||
    input.lifetimeAttempts !== input.currentAttempt ||
    input.authorizationAttempts > input.lifetimeAttempts ||
    input.authorizationAttempts >= input.authorizationMaxAttempts ||
    input.lifetimeAttempts >= input.maxAttempts ||
    input.currentAttempt + 1 > input.maxAttempts
  )
    throw new ServiceError('Analysis follow-up authority has exhausted or inconsistent attempt counters.', 'CONFLICT')
}
