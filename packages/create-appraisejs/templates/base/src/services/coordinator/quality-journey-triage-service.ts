import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson as json } from '@/lib/catalog-contracts'
import {
  hashQualityJourneyExecutionValue as hash,
  qualityJourneyTriagePrepareSchema,
  qualityJourneyTriageReadSchema,
  qualityJourneyTriageSubmitSchema,
  qualityJourneyTriageReportSchema,
  qualityJourneyReportReviewSchema,
  type QualityJourneyTriageReport,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  completeTriagerWorkInTransaction,
  issueQualityJourneySpecializedWorkItem,
  setQualityJourneyActiveWorkItems,
  submitDurableQualityJourneyCommandInTransaction,
} from './quality-journey-service'
import {
  compileQualityJourneyTriageInput,
  triageInputArtifacts,
  type TriageInput,
} from './quality-journey-triage-input'
import { validateQualityJourneyTriageReport } from './quality-journey-triage-validation'
import { ensureQualityJourneyAutomationForApprovedScenarios } from './quality-journey-automation-service'

const idFor = (...parts: string[]) => `qjt_${createHash('sha256').update(json(parts)).digest('hex').slice(0, 24)}`
const conflict = (message: string) => new ServiceError(message, 'CONFLICT')
type Db = PrismaClient | Prisma.TransactionClient
async function journeyScope(input: { journeyId: string; targetProjectId: string }, db: Db) {
  const journey = await db.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  return journey
}

export async function getQualityJourneyTriage(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyTriageReadSchema.parse(value)
  const journey = await journeyScope(input, client)
  const [assignments, reports] = await Promise.all([
    client.qualityJourneyTriageAssignment.findMany({
      where: { journeyId: input.journeyId },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyTriageReport.findMany({
      where: { journeyId: input.journeyId },
      include: { review: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return {
    activeReportRevisionId: journey.activeTriageReportId,
    assignments: assignments.map(a => ({
      id: a.id,
      workItemId: a.workItemId,
      executionCycleId: a.executionCycleId,
      inputHash: a.inputHash,
      input: JSON.parse(a.inputJson) as TriageInput,
    })),
    reports: reports.map(r => ({
      id: r.id,
      contentHash: r.contentHash,
      report: qualityJourneyTriageReportSchema.parse(JSON.parse(r.reportJson)),
      review: r.review
        ? { kind: r.review.kind, feedback: r.review.feedback, successorCycleId: r.review.successorCycleId }
        : null,
    })),
  }
}

async function issueTriage(input: TriageInput, tx: Prisma.TransactionClient) {
  const journey = await journeyScope(input, tx)
  if (journey.stage !== 'TRIAGE' || journey.activeCycleId !== input.cycleId)
    throw conflict('Triage assignment requires the active sealed cycle.')
  const inputHash = hash(input)
  const assignmentId = idFor(
    'assignment',
    input.journeyId,
    input.executionCycleId,
    input.predecessorReport?.reportRevisionId ?? 'initial',
  )
  const existing = await tx.qualityJourneyTriageAssignment.findUnique({ where: { id: assignmentId } })
  if (existing) {
    if (existing.inputHash !== inputHash) throw conflict('Triage assignment conflicts with frozen input.')
    return existing
  }
  const item = await issueQualityJourneySpecializedWorkItem(
    journey,
    {
      id: idFor('work', assignmentId),
      role: 'TRIAGER',
      inputHash,
      inputArtifacts: triageInputArtifacts(input),
      authorizationScope: {
        allowedTargetRoutes: [],
        allowedResourceIds: [],
        scope: {
          permittedTools: ['artifact.read', 'evidence.read', 'report.propose'],
          permittedCommands: ['work.output.submit'],
          filesystemPaths: [],
          networkOrigins: [],
          credentialGrantIds: [],
          targetAccess: 'NONE',
        },
      },
      completionCriteria: [
        'Attribute every material run outcome or leave it explicitly unresolved.',
        'Bind the complete report to accepted requirements, scenarios and sealed evidence.',
        'Do not consume producer narrative or mutate automation.',
      ],
    },
    tx,
  )
  // Legacy generic items never become accepted report authority.
  const legacy = await tx.qualityJourneyWorkItem.findMany({
    where: {
      journeyId: journey.id,
      cycleId: input.cycleId,
      role: 'TRIAGER',
      id: { not: item.id },
      status: { notIn: ['COMPLETED', 'SUPERSEDED', 'CANCELLED'] },
    },
    select: { id: true },
  })
  const legacyIds = legacy.map(i => i.id)
  await tx.qualityJourneyWorkAuthorization.updateMany({
    where: { workItemId: { in: legacyIds }, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedBy: 'RUNNER',
      revocationReason: 'Replaced by isolated sealed-evidence triage authority.',
    },
  })
  await tx.qualityJourneyWorkAttempt.updateMany({
    where: {
      workItemId: { in: legacyIds },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUSED', 'FAILED', 'EXPIRED'] },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: 'RUNNER',
      cancellationReason: 'Replaced by isolated sealed-evidence triage authority.',
    },
  })
  await tx.qualityJourneyWorkItem.updateMany({
    where: {
      journeyId: journey.id,
      cycleId: input.cycleId,
      role: 'TRIAGER',
      id: { not: item.id },
      status: { notIn: ['COMPLETED', 'SUPERSEDED', 'CANCELLED'] },
    },
    data: { status: 'SUPERSEDED' },
  })
  const assignment = await tx.qualityJourneyTriageAssignment.create({
    data: {
      id: assignmentId,
      journeyId: journey.id,
      executionCycleId: input.executionCycleId,
      workItemId: item.id,
      predecessorReportRevisionId: input.predecessorReport?.reportRevisionId,
      inputHash,
      inputJson: json(input),
    },
  })
  await setQualityJourneyActiveWorkItems(journey.id, [item.id], tx)
  return assignment
}

export async function prepareQualityJourneyTriage(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyTriagePrepareSchema.parse(value)
  await client.$transaction(async tx => {
    const journey = await journeyScope(input, tx)
    if (journey.stage !== 'TRIAGE') throw conflict('Triage is not active.')
    const existing = await tx.qualityJourneyTriageAssignment.findFirst({
      where: { journeyId: input.journeyId, executionCycleId: input.executionCycleId },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      if ((JSON.parse(existing.inputJson) as TriageInput).cycleId !== journey.activeCycleId)
        throw conflict('Triage cycle is stale.')
      return
    }
    await issueTriage(await compileQualityJourneyTriageInput(input, tx), tx)
  })
  return getQualityJourneyTriage({ journeyId: input.journeyId, targetProjectId: input.targetProjectId }, client)
}

async function persistReportArtifact(
  input: TriageInput,
  report: QualityJourneyTriageReport,
  contentHash: string,
  tx: Prisma.TransactionClient,
) {
  const ref = {
    kind: 'TEST_REPORT_ANALYSIS_REVISION' as const,
    artifactId: report.reportRevisionId,
    revisionId: report.reportRevisionId,
    contentHash,
  }
  await tx.qualityJourneyArtifact.create({
    data: {
      id: idFor('artifact', report.reportRevisionId),
      identityKey: `${ref.kind}:${ref.artifactId}:${ref.revisionId}`,
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: input.cycleId,
      ...ref,
      artifactJson: json({ report, source: input }),
    },
  })
  for (const target of triageInputArtifacts(input).filter(r => r.kind !== 'REPORT_REVISION_FEEDBACK')) {
    const relation =
      target.kind === 'EVIDENCE_RECEIPT'
        ? 'ATTRIBUTES'
        : target.kind === 'TEST_REPORT_ANALYSIS_REVISION'
          ? 'SUPERSEDES'
          : 'ANALYZES'
    await tx.qualityJourneyArtifactLink.create({
      data: {
        id: idFor('link', report.reportRevisionId, json(target)),
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: input.cycleId,
        relation,
        linkHash: hash({ source: ref, target, relation }),
        sourceJson: json(ref),
        targetJson: json(target),
      },
    })
  }
  return ref
}

type ReportSubmission = ReturnType<typeof qualityJourneyTriageSubmitSchema.parse>

async function activeReportAssignment(
  input: ReportSubmission,
  journey: Awaited<ReturnType<typeof journeyScope>>,
  tx: Prisma.TransactionClient,
) {
  const assignment = await tx.qualityJourneyTriageAssignment.findUnique({ where: { workItemId: input.workItemId } })
  if (!assignment || assignment.journeyId !== journey.id || journey.stage !== 'TRIAGE')
    throw conflict('No active specialized Triager assignment exists.')
  const frozen = JSON.parse(assignment.inputJson) as TriageInput
  assertFrozenReportScope(input, journey, frozen, assignment.inputHash)
  const current = await compileQualityJourneyTriageInput(
    {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      executionCycleId: assignment.executionCycleId,
    },
    tx,
  )
  if (
    hash({ ...current, ...(frozen.predecessorReport ? { predecessorReport: frozen.predecessorReport } : {}) }) !==
    assignment.inputHash
  )
    throw conflict('Triage accepted input changed after issuance.')
  return { assignment, frozen }
}

function assertFrozenReportScope(
  input: ReportSubmission,
  journey: Awaited<ReturnType<typeof journeyScope>>,
  frozen: TriageInput,
  inputHash: string,
) {
  if (
    frozen.cycleId !== journey.activeCycleId ||
    input.report.inputHash !== inputHash ||
    hash(frozen) !== inputHash ||
    !JSON.parse(journey.activeWorkItemIdsJson).includes(input.workItemId)
  )
    throw conflict('Triager input or active cycle is stale.')
}

function assertReportResult(
  input: ReportSubmission,
  output: { kind: string; artifactId: string; revisionId: string; contentHash: string },
) {
  if (
    input.result.attemptId !== input.attemptId ||
    input.result.role !== 'TRIAGER' ||
    input.result.status !== 'COMPLETED' ||
    json(input.result.outputs) !== json([output])
  )
    throw conflict('Triager result must identify exactly the complete report and frozen source hash.')
}

export async function submitQualityJourneyTriageReport(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyTriageSubmitSchema.parse(value)
  return client.$transaction(async tx => {
    const journey = await journeyScope(input, tx)
    const requestHash = hash(input)
    const replay = await tx.qualityJourneyTriageReport.findUnique({
      where: { journeyId_idempotencyKey: { journeyId: input.journeyId, idempotencyKey: input.idempotencyKey } },
    })
    if (replay) {
      if (replay.requestHash !== requestHash)
        throw conflict('Report idempotency key was reused with different content.')
      return { reportRevisionId: replay.id, contentHash: replay.contentHash, replayed: true }
    }
    const { assignment, frozen } = await activeReportAssignment(input, journey, tx)
    validateQualityJourneyTriageReport(input.report, frozen)
    const contentHash = hash({ report: input.report, source: frozen })
    const output = {
      kind: 'TEST_REPORT_ANALYSIS_REVISION',
      artifactId: input.report.reportRevisionId,
      revisionId: input.report.reportRevisionId,
      contentHash,
    }
    assertReportResult(input, output)
    const ref = await persistReportArtifact(frozen, input.report, contentHash, tx)
    await completeTriagerWorkInTransaction(input, tx)
    await tx.qualityJourneyTriageReport.create({
      data: {
        id: input.report.reportRevisionId,
        journeyId: journey.id,
        assignmentId: assignment.id,
        contentHash,
        reportJson: json(input.report),
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
    })
    const after = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journey.id } })
    const command = await submitDurableQualityJourneyCommandInTransaction(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        command: 'PUBLISH_TRIAGE_REPORT',
        commandId: idFor('publish', input.report.reportRevisionId),
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        actor: 'RUNNER',
        expectedStateHash: after.stateHash,
        idempotencyKey: `report:${input.idempotencyKey}`,
        inputArtifactRefs: [ref],
        payload: { artifactRevisionId: ref.revisionId, artifactHash: ref.contentHash },
      },
      tx,
      true,
      false,
    )
    if (command.outcome !== 'COMMITTED') throw conflict('Report publication could not commit.')
    await tx.qualityJourney.update({
      where: { id: journey.id },
      data: { activeTriageReportId: input.report.reportRevisionId },
    })
    return { reportRevisionId: input.report.reportRevisionId, contentHash, replayed: false }
  })
}

type Review = ReturnType<typeof qualityJourneyReportReviewSchema.parse>
async function exactReview(input: Review, kind: string, tx: Prisma.TransactionClient) {
  const journey = await journeyScope(input, tx)
  const requestHash = hash({ ...input, kind })
  const replay = await tx.qualityJourneyReportReview.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: input.journeyId, idempotencyKey: input.idempotencyKey } },
  })
  if (replay) {
    if (replay.requestHash !== requestHash) throw conflict('Report review idempotency key conflicts.')
    return { replay }
  }
  const report = await tx.qualityJourneyTriageReport.findFirst({
    where: { id: input.reportRevisionId, journeyId: journey.id },
    include: { assignment: true, review: true },
  })
  if (
    !report ||
    report.review ||
    journey.activeTriageReportId !== report.id ||
    journey.stage !== 'REPORT_REVIEW' ||
    journey.stateHash !== input.expectedStateHash ||
    report.contentHash !== input.expectedReportHash
  )
    throw conflict('Report review must bind the exact current report and state.')
  return { journey, report, requestHash }
}

async function reportReviewCommand(
  input: Review,
  command: 'REQUEST_REPORT_REVISION' | 'START_REMEDIATION_CYCLE',
  payload: unknown,
  tx: Prisma.TransactionClient,
) {
  const result = await submitDurableQualityJourneyCommandInTransaction(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      command,
      commandId: idFor(command, input.journeyId, input.idempotencyKey),
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      actor: 'USER',
      expectedStateHash: input.expectedStateHash,
      idempotencyKey: `report-review:${input.idempotencyKey}`,
      inputArtifactRefs: [
        {
          kind: 'TEST_REPORT_ANALYSIS_REVISION',
          artifactId: input.reportRevisionId,
          revisionId: input.reportRevisionId,
          contentHash: input.expectedReportHash,
        },
      ],
      payload,
    },
    tx,
    true,
    false,
  )
  if (result.outcome !== 'COMMITTED') throw conflict('Report review transition could not commit.')
}

/** Trusted local UI entry point. A feedback request always reviews the full report. */
export async function requestQualityJourneyReportRevision(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyReportReviewSchema.parse(value)
  return client.$transaction(async tx => {
    const context = await exactReview(input, 'FULL_REPORT_REVISION', tx)
    if (context.replay) return context.replay
    const { report, requestHash } = context
    const receipt = await tx.qualityJourneyReportReview.create({
      data: {
        id: idFor('review', input.journeyId, input.idempotencyKey),
        journeyId: input.journeyId,
        reportRevisionId: report.id,
        kind: 'FULL_REPORT_REVISION',
        feedback: input.feedback,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
    })
    await reportReviewCommand(
      input,
      'REQUEST_REPORT_REVISION',
      { reviewedRevisionId: report.id, reviewedHash: report.contentHash, feedback: input.feedback },
      tx,
    )
    const source = JSON.parse(report.assignment.inputJson) as TriageInput
    await tx.qualityJourneyArtifact.create({
      data: {
        id: idFor('feedback', report.id),
        identityKey: `REPORT_REVISION_FEEDBACK:${report.id}:unrevisioned`,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: source.cycleId,
        kind: 'REPORT_REVISION_FEEDBACK',
        artifactId: report.id,
        contentHash: hash(input.feedback),
        artifactJson: json(input.feedback),
      },
    })
    await issueTriage(
      {
        ...source,
        predecessorReport: {
          reportRevisionId: report.id,
          contentHash: report.contentHash,
          report: JSON.parse(report.reportJson),
          feedback: input.feedback,
        },
      },
      tx,
    )
    return receipt
  })
}

/** UI approval atomically consumes this report's explicit correction proposal. */
export async function approveQualityJourneyRemediation(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyReportReviewSchema.parse(value)
  return client.$transaction(async tx => {
    const context = await exactReview(input, 'AUTOMATION_CORRECTION_APPROVED', tx)
    if (context.replay) return context.replay
    const { journey, report, requestHash } = context
    const content = qualityJourneyTriageReportSchema.parse(JSON.parse(report.reportJson))
    if (!content.remediation) throw conflict('The reviewed report has no bounded automation correction proposal.')
    const cycleId = idFor('cycle', input.journeyId, report.id)
    const scope = {
      reportRevisionId: report.id,
      reportHash: report.contentHash,
      sourceExecutionCycleId: report.assignment.executionCycleId,
      ...content.remediation,
    }
    const latest = await tx.qualityJourneyCycle.findFirst({
      where: { journeyId: journey.id },
      orderBy: { sequence: 'desc' },
    })
    await tx.qualityJourneyCycle.create({
      data: {
        id: cycleId,
        journeyId: journey.id,
        sequence: (latest?.sequence ?? 0) + 1,
        predecessorCycleId: journey.activeCycleId,
        scopeJson: json({ remediation: scope, scopeHash: hash(scope) }),
      },
    })
    const receipt = await tx.qualityJourneyReportReview.create({
      data: {
        id: idFor('review', input.journeyId, input.idempotencyKey),
        journeyId: journey.id,
        reportRevisionId: report.id,
        kind: 'AUTOMATION_CORRECTION_APPROVED',
        feedback: input.feedback,
        successorCycleId: cycleId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
    })
    await tx.qualityJourneyArtifact.create({
      data: {
        id: idFor('remediation', report.id),
        identityKey: `REMEDIATION_APPROVAL:remediation:${report.id}:unrevisioned`,
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        cycleId,
        kind: 'REMEDIATION_APPROVAL',
        artifactId: `remediation:${report.id}`,
        contentHash: hash(scope),
        artifactJson: json(scope),
      },
    })
    await reportReviewCommand(
      input,
      'START_REMEDIATION_CYCLE',
      { reportRevisionId: report.id, remediationScope: json(scope), cycleId },
      tx,
    )
    await ensureQualityJourneyAutomationForApprovedScenarios(
      { journeyId: journey.id, targetProjectId: journey.targetProjectId },
      tx,
    )
    return receipt
  })
}
