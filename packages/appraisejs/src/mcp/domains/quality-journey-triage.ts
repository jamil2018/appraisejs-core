import { z } from 'zod'

import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const boundedText = z.string().trim().min(1).max(8_000)
const ids = z
  .array(id)
  .max(512)
  .refine(values => new Set(values).size === values.length, 'IDs must be unique.')
const scope = { target: z.string().min(1), journeyId: id }

export const triageEvidenceReadInput = z
  .object({
    ...scope,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    receiptId: id,
    artifactKind: z.enum(['report', 'log']),
    offset: z
      .number()
      .int()
      .min(0)
      .max(2 * 1024 * 1024)
      .optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(64 * 1024)
      .optional(),
  })
  .strict()

const finding = z
  .object({
    findingId: id,
    testRunId: id,
    evidenceReceiptId: id,
    scenarioRevisionId: id,
    requirementIds: ids,
    kind: z.enum([
      'TARGET_DEFECT',
      'REQUIREMENT_AMBIGUITY',
      'VALIDATION_DESIGN_DEFECT',
      'VALIDATION_REALIZATION_DEFECT',
      'APPRAISE_RUNTIME_DEFECT',
      'ENVIRONMENT_OR_DATA_DEFECT',
      'AUTOMATION_BLOCKED',
      'INCONCLUSIVE',
    ]),
    targetOutcome: z.enum(['FAILED', 'NOT_EVALUATED']),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    rationale: boundedText,
    competingHypotheses: z.array(boundedText).max(32),
    unresolved: z.boolean(),
    postmortem: z
      .object({
        observation: boundedText,
        expectedBehavior: boundedText,
        causalAnalysis: boundedText,
        nextAction: boundedText,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.kind === 'TARGET_DEFECT') !== (value.targetOutcome === 'FAILED'))
      context.addIssue({ code: 'custom', message: 'Only target defects establish target failure.' })
    if (value.kind === 'INCONCLUSIVE' && !value.unresolved)
      context.addIssue({ code: 'custom', message: 'Inconclusive findings must remain unresolved.' })
  })

export const triageReportInput = z
  .object({
    schemaVersion: z.literal('appraise.quality-journey/v1'),
    reportRevisionId: id,
    executionCycleId: id,
    cycleId: id,
    predecessorReportRevisionId: id.optional(),
    inputHash: hash,
    summary: boundedText,
    findings: z.array(finding).max(2_048),
    coverage: z
      .array(
        z
          .object({
            requirementId: id,
            scenarioRevisionIds: ids,
            testRunIds: ids,
            outcome: z.enum(['PASSED', 'FAILED', 'NOT_EVALUATED', 'UNRESOLVED']),
            rationale: boundedText,
          })
          .strict(),
      )
      .min(1)
      .max(2_048),
    residualRisks: z.array(boundedText).min(1).max(128),
    recommendations: z.array(boundedText).min(1).max(128),
    remediation: z
      .object({
        kind: z.literal('AUTOMATION_CORRECTION'),
        findingIds: ids.refine(values => values.length > 0),
        scenarioRevisionIds: ids.refine(values => values.length > 0),
        scope: boundedText,
      })
      .strict()
      .optional(),
  })
  .strict()

const workerResult = z
  .object({
    schemaVersion: z.literal('appraise.quality-journey/v1'),
    assignmentId: id,
    workItemId: id,
    attemptId: id,
    roleContractDigest: hash,
    inputHash: hash,
    role: z.literal('TRIAGER'),
    status: z.enum(['COMPLETED', 'BLOCKED', 'QUESTION_RAISED', 'REVISION_REQUIRED']),
    outputs: z
      .array(
        z
          .object({
            kind: z.enum(['TEST_REPORT_ANALYSIS_REVISION']),
            artifactId: id,
            revisionId: id,
            contentHash: hash,
          })
          .strict(),
      )
      .max(1_536),
    evidenceReceipts: z.array(hash),
    assumptions: z.array(boundedText),
    blockers: z.array(
      z.object({ code: id, summary: boundedText, evidence: z.array(hash), requiredResolution: boundedText }).strict(),
    ),
    unresolvedQuestions: z.array(z.object({ questionId: id, prompt: boundedText, required: z.boolean() }).strict()),
    submittedAt: z.string().datetime(),
  })
  .strict()

export const triagePrepareInput = z.object({ ...scope, executionCycleId: id }).strict()
export const triageSubmitInput = z
  .object({
    ...scope,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    idempotencyKey: id,
    report: triageReportInput,
    result: workerResult,
  })
  .strict()

/** Review decisions stay in the local Appraise UI; MCP workers can only read, prepare, and submit triage reports. */
export function registerQualityJourneyTriageOperations({ server, api }: McpRegistryContext) {
  server.registerTool(
    'quality_journey_triage_get',
    {
      description:
        'Read the exact triage assignments, immutable report revisions, sealed evidence lineage, and any durable report review outcome.',
      inputSchema: scope,
    },
    async ({ target, journeyId }) =>
      text(await api.request(`quality/journeys/${journeyId}/triage/context?target=${encodeURIComponent(target)}`)),
  )
  server.registerTool(
    'quality_journey_triage_evidence_read',
    {
      description:
        'Read a bounded text page from an exact sealed Triager report or log receipt. Appraise resolves the target and never accepts artifact paths.',
      inputSchema: triageEvidenceReadInput.shape,
    },
    async input => {
      const { target, journeyId, ...body } = triageEvidenceReadInput.parse(input)
      return text(
        await api.request(`quality/journeys/${journeyId}/triage/evidence`, {
          method: 'POST',
          body: JSON.stringify({ target, ...body }),
        }),
      )
    },
  )
  server.registerTool(
    'quality_journey_triage_prepare',
    {
      description:
        'Prepare one Triager assignment from an exact terminal execution cycle with sealed run evidence and approved scenario lineage.',
      inputSchema: triagePrepareInput.shape,
    },
    async input => {
      const { target, journeyId, ...body } = triagePrepareInput.parse(input)
      return text(
        await api.request(`quality/journeys/${journeyId}/triage/prepare`, {
          method: 'POST',
          body: JSON.stringify({ target, ...body }),
        }),
      )
    },
  )
  server.registerTool(
    'quality_journey_triage_submit',
    {
      description:
        'Submit one bounded attribution report only through the exact leased Triager assignment. Full-report revision and remediation approval remain local UI decisions.',
      inputSchema: triageSubmitInput.shape,
    },
    async input => {
      const { target, journeyId, ...body } = triageSubmitInput.parse(input)
      return text(
        await api.request(`quality/journeys/${journeyId}/triage/submit`, {
          method: 'POST',
          body: JSON.stringify({ target, ...body }),
        }),
      )
    },
  )
}
