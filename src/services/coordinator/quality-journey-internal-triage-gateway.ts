import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  hashQualityJourneyExecutionValue as hash,
  qualityJourneyContractVersion,
  qualityJourneyTriageEvidenceReadSchema,
  qualityJourneyTriageReportSchema,
  type WorkerResultEnvelope,
} from '@/lib/quality-journey'
import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  createManagedWorkerAssignmentGrant,
  type CanonicalMcpDefinition,
} from '@/lib/quality-journey/managed-worker-gateway'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { ServiceError } from '@/services/shared/errors'
import {
  assertManagedWorkerSubmissionOutcome,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'
import {
  internalTriageReportRevisionId,
  readInternalTriagerAssignment,
  submitExternalQualityJourneyTriageReport,
} from './quality-journey-triage-service'
import { readQualityJourneyTriageEvidence } from './quality-journey-triage-evidence-service'

const readTool = 'quality_journey_triage_get'
const evidenceTool = 'quality_journey_triage_evidence_read'
const submitTool = 'quality_journey_triage_submit'
const evidenceSelectors = qualityJourneyTriageEvidenceReadSchema.pick({
  receiptId: true,
  artifactKind: true,
  offset: true,
  limit: true,
})

/** Repository-only trusted composition; it grants no human or execution capability. */
export async function createQualityJourneyInternalTriageGateway(
  input: ExternalQualityJourneySubmissionBinding,
  canonicalDefinitions: readonly CanonicalMcpDefinition[],
  client: PrismaClient,
) {
  const binding = structuredClone(input)
  if (binding.role !== 'TRIAGER') throw new ServiceError('Internal Triager role is required.', 'UNAUTHORIZED')
  const { journeyId, targetProjectId, workItemId, attemptId, leaseId } = binding
  const profile = createManagedWorkerRegistrationProfile('TRIAGER', canonicalDefinitions)
  const read = () =>
    client.$transaction(async tx => {
      const { journey, item, ...authority } = await readInternalWorkerAuthority(binding, tx)
      return {
        assignment: {
          ...(await readInternalTriagerAssignment(journey, item, tx)),
          reportRevisionId: internalTriageReportRevisionId(journeyId, attemptId),
        },
        ...authority,
      }
    })
  const original = await read()
  const originalDigest = hash(original.assignment)
  const { secret, sealedGrant } = createManagedWorkerAssignmentGrant(binding, profile, original)

  async function callGateway(inputCall: {
    sealedGrant: string
    profileDigest: string
    toolName: string
    arguments: Record<string, unknown>
  }) {
    const call = structuredClone(inputCall)
    if (call.profileDigest !== profile.contractDigest || ![readTool, evidenceTool, submitTool].includes(call.toolName))
      throw new ServiceError('Tool is outside the internal Triager profile.', 'UNAUTHORIZED')
    let acceptedKey: string | undefined
    return executeManagedWorkerGatewayCall({
      ...call,
      secret,
      profile,
      async authorize({ stage, requestHash }) {
        if (stage === 'after_io' && acceptedKey) {
          await assertManagedWorkerSubmissionOutcome(
            {
              ...binding,
              operation: 'TRIAGE_REPORT_SUBMIT',
              idempotencyKey: acceptedKey,
            },
            client,
          )
        } else {
          const current = await read()
          if (
            current.authorizationId !== original.authorizationId ||
            current.roleContractDigest !== original.roleContractDigest ||
            hash(current.assignment) !== originalDigest
          )
            throw new ServiceError('Internal Triager grant has stale assignment inputs.', 'CONFLICT')
        }
        return { decisionDigest: hash({ stage, requestHash, attemptId }), ownerToken: binding.assignmentSecret }
      },
      async invoke() {
        if (call.toolName === readTool) {
          z.strictObject({}).parse(call.arguments)
          return structuredClone(original.assignment)
        }
        if (call.toolName === evidenceTool) {
          const selectors = evidenceSelectors.parse(call.arguments)
          return readQualityJourneyTriageEvidence(
            {
              ...selectors,
              journeyId,
              targetProjectId,
              workItemId,
              attemptId,
              leaseId,
              ownerToken: binding.assignmentSecret,
            },
            client,
            binding,
          )
        }
        const request = z
          .strictObject({
            idempotencyKey: z.string().min(1).max(200),
            report: z.record(z.string(), z.unknown()),
          })
          .parse(call.arguments)
        const report = qualityJourneyTriageReportSchema.parse({
          ...request.report,
          inputHash: original.assignment.inputHash,
        })
        const assignment = original.assignment
        const source = {
          journeyId,
          targetProjectId,
          executionCycleId: assignment.executionCycleId,
          cycleId: assignment.cycleId,
          analysis: assignment.analysis,
          scenarios: assignment.scenarios,
          runs: assignment.runs,
          ...(assignment.predecessorReport ? { predecessorReport: assignment.predecessorReport } : {}),
        }
        const contentHash = hash({ report, source })
        const result: WorkerResultEnvelope = {
          schemaVersion: qualityJourneyContractVersion,
          assignmentId: binding.assignmentId,
          workItemId,
          attemptId,
          role: 'TRIAGER',
          roleContractDigest: original.roleContractDigest,
          inputHash: original.assignment.inputHash,
          status: 'COMPLETED',
          outputs: [
            {
              kind: 'TEST_REPORT_ANALYSIS_REVISION',
              artifactId: report.reportRevisionId,
              revisionId: report.reportRevisionId,
              contentHash,
            },
          ],
          evidenceReceipts: [],
          assumptions: [],
          blockers: [],
          unresolvedQuestions: [],
          submittedAt: new Date().toISOString(),
        }
        const accepted = await submitExternalQualityJourneyTriageReport(
          {
            journeyId,
            targetProjectId,
            workItemId,
            attemptId,
            leaseId,
            assignmentId: binding.assignmentId,
            assignmentGeneration: binding.assignmentGeneration,
            assignmentSecret: binding.assignmentSecret,
            idempotencyKey: request.idempotencyKey,
            report,
            result,
          },
          binding.principal,
          client,
          binding,
        )
        acceptedKey = request.idempotencyKey
        return accepted
      },
    })
  }
  return { profile, sealedGrant, callGateway }
}
