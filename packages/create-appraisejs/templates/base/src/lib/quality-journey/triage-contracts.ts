import { z } from 'zod'
import { qualityJourneyContractVersion, qualityJourneyIdentifierSchema, workerResultEnvelopeSchema } from './contracts'

const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const text = z.string().trim().min(1).max(8_000)
const ids = z
  .array(id)
  .max(512)
  .refine(values => new Set(values).size === values.length, 'IDs must be unique.')
const triageAttributionKindSchema = z.enum([
  'TARGET_DEFECT',
  'REQUIREMENT_AMBIGUITY',
  'VALIDATION_DESIGN_DEFECT',
  'VALIDATION_REALIZATION_DEFECT',
  'APPRAISE_RUNTIME_DEFECT',
  'ENVIRONMENT_OR_DATA_DEFECT',
  'AUTOMATION_BLOCKED',
  'INCONCLUSIVE',
])
const qualityJourneyTriageFindingSchema = z
  .object({
    findingId: id,
    testRunId: id,
    evidenceReceiptId: id,
    scenarioRevisionId: id,
    requirementIds: ids,
    kind: triageAttributionKindSchema,
    targetOutcome: z.enum(['FAILED', 'NOT_EVALUATED']),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    rationale: text,
    competingHypotheses: z.array(text).max(32),
    unresolved: z.boolean(),
    postmortem: z
      .object({ observation: text, expectedBehavior: text, causalAnalysis: text, nextAction: text })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.kind === 'TARGET_DEFECT') !== (value.targetOutcome === 'FAILED'))
      ctx.addIssue({ code: 'custom', message: 'Only target defects establish target failure.' })
    if (value.kind === 'INCONCLUSIVE' && !value.unresolved)
      ctx.addIssue({ code: 'custom', message: 'Inconclusive findings must remain unresolved.' })
  })
export const qualityJourneyTriageReportSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    reportRevisionId: id,
    executionCycleId: id,
    cycleId: id,
    predecessorReportRevisionId: id.optional(),
    inputHash: digest,
    summary: text,
    findings: z.array(qualityJourneyTriageFindingSchema).max(2048),
    coverage: z
      .array(
        z
          .object({
            requirementId: id,
            scenarioRevisionIds: ids,
            testRunIds: ids,
            outcome: z.enum(['PASSED', 'FAILED', 'NOT_EVALUATED', 'UNRESOLVED']),
            rationale: text,
          })
          .strict(),
      )
      .min(1)
      .max(2048),
    residualRisks: z.array(text).max(128),
    recommendations: z.array(text).min(1).max(128),
    remediation: z
      .object({
        kind: z.literal('AUTOMATION_CORRECTION'),
        findingIds: ids.refine(values => values.length > 0),
        scenarioRevisionIds: ids.refine(values => values.length > 0),
        scope: text,
      })
      .strict()
      .optional(),
  })
  .strict()
export const qualityJourneyTriageReadSchema = z.object({ journeyId: id, targetProjectId: id }).strict()
export const qualityJourneyTriagePrepareSchema = qualityJourneyTriageReadSchema
  .extend({ executionCycleId: id })
  .strict()
export const qualityJourneyTriageSubmitSchema = qualityJourneyTriageReadSchema
  .extend({
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    idempotencyKey: id,
    report: qualityJourneyTriageReportSchema,
    result: workerResultEnvelopeSchema,
  })
  .strict()
export const qualityJourneyReportReviewSchema = qualityJourneyTriageReadSchema
  .extend({
    reportRevisionId: id,
    expectedReportHash: digest,
    expectedStateHash: digest,
    idempotencyKey: id,
    feedback: text,
  })
  .strict()
export type QualityJourneyTriageReport = z.infer<typeof qualityJourneyTriageReportSchema>
