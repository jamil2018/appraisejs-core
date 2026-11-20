import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { qualityJourneyTriageEvidenceMaxBytes } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { hasOperatorPreparation, reviewSealedRuns } from './app-managed-operator-triage'
import { assertCurrentCoordinatorSession, type CoordinatorSessionBinding } from './quality-journey-coordinator-session'
import { readInternalTriagerAssignment } from './quality-journey-triage-service'

const artifacts = z
  .array(
    z
      .object({
        kind: z.string(),
        contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .passthrough(),
  )
  .max(512)
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

/** Human review has no worker lease. Read only the frozen assignment and verified same-project report bytes. */
export async function previewAppManagedOperatorTriage(owner: CoordinatorSessionBinding, client: PrismaClient) {
  const read = () =>
    client.$transaction(async tx => {
      const { journey } = await assertCurrentCoordinatorSession(owner, tx)
      if (
        journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
        journey.status !== 'ACTIVE' ||
        journey.stage !== 'TRIAGE' ||
        JSON.parse(journey.blockerIdsJson).length ||
        JSON.parse(journey.unresolvedQuestionIdsJson).length
      )
        conflict('Report review requires the current active, unblocked Triage stage.')
      if (
        !(await hasOperatorPreparation(
          { journeyId: journey.id, targetProjectId: journey.targetProjectId, cycleId: journey.activeCycleId },
          tx,
        ))
      )
        conflict('Operator report review requires completed manual preparation.')
      const items = await tx.qualityJourneyWorkItem.findMany({
        where: {
          id: { in: JSON.parse(journey.activeWorkItemIdsJson) as string[] },
          journeyId: journey.id,
          targetProjectId: journey.targetProjectId,
          cycleId: journey.activeCycleId,
          role: 'TRIAGER',
        },
      })
      if (items.length !== 1) conflict('Report review requires one exact active Triager assignment.')
      const item = items[0]!
      const frozen = await readInternalTriagerAssignment(journey, item, tx)
      return { frozen, workItemId: item.id, stateHash: journey.stateHash }
    })
  const original = await read()
  const access = new TestRunArtifactAccessService(client)
  const evidence: Parameters<typeof reviewSealedRuns>[1] = []
  let total = 0
  for (const run of original.frozen.runs) {
    const reports = artifacts.parse(run.evidence.artifacts).filter(artifact => artifact.kind === 'report')
    if (reports.length > 1) conflict('Sealed run evidence repeats its report descriptor.')
    for (const artifact of reports) {
      total += artifact.size
      if (artifact.size > qualityJourneyTriageEvidenceMaxBytes || total > 2_000_000)
        conflict('Sealed report evidence exceeds the review bound.')
      const identity = await client.testRun.findFirst({
        where: { id: run.testRunId, runId: run.runId, targetProjectId: owner.targetProjectId },
        select: { id: true },
      })
      if (!identity) conflict('Sealed report run identity changed.')
      const result = await access.readBytes({
        runId: run.runId,
        kind: 'report',
        expectedTargetProjectId: owner.targetProjectId,
      })
      if (
        result.bytes.byteLength !== artifact.size ||
        `sha256:${createHash('sha256').update(result.bytes).digest('hex')}` !== artifact.contentHash
      )
        conflict('Sealed report bytes no longer match their frozen receipt.')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)
      } catch {
        conflict('Sealed report text is not valid UTF-8.')
      }
      evidence.push({
        receiptId: run.evidenceReceiptId,
        artifactKind: 'report',
        contentHash: artifact.contentHash,
        size: artifact.size,
        text,
      })
    }
  }
  // Recheck current ownership, active assignment, lineage and state after filesystem reads.
  const current = await read()
  if (
    current.workItemId !== original.workItemId ||
    current.stateHash !== original.stateHash ||
    current.frozen.inputHash !== original.frozen.inputHash
  )
    conflict('The Journey or sealed evidence changed during review. Reload its current results.')
  return {
    inputHash: original.frozen.inputHash,
    expectedStateHash: current.stateHash,
    runs: reviewSealedRuns(original.frozen, evidence),
  }
}
