import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson as json } from '@/lib/catalog-contracts'
import {
  hashQualityJourneyExecutionValue as hash,
  journeyClosureSchema,
  journeyArtifactLinkSchema,
  qualityJourneyClosureInputSchema,
  qualityJourneyTriageReportSchema,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import { compileQualityJourneyTriageInput, type TriageInput } from './quality-journey-triage-input'
import { submitDurableQualityJourneyCommandInTransaction } from './quality-journey-service'
import { qualityJourneyClosureItems } from './quality-journey-closure-validation'
import { validateQualityJourneyTriageReport } from './quality-journey-triage-validation'

type Scope = { journeyId: string; targetProjectId: string }
type Db = Prisma.TransactionClient
const conflict = (message: string) => new ServiceError(message, 'CONFLICT')
const idFor = (...parts: string[]) => `qjc_${createHash('sha256').update(json(parts)).digest('hex').slice(0, 24)}`

async function readClosureContext(scope: Scope, tx: Db) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  const activeIds = JSON.parse(journey.activeWorkItemIdsJson) as string[]
  const [closure, report, blockers, running, completedActiveWork] = await Promise.all([
    tx.qualityJourneyClosure.findUnique({ where: { journeyId: journey.id } }),
    tx.qualityJourneyTriageReport.findFirst({
      where: { id: journey.activeTriageReportId ?? '', journeyId: journey.id },
      include: { assignment: true, review: true },
    }),
    tx.qualityJourneyBlocker.count({ where: { journeyId: journey.id, status: 'ACTIVE' } }),
    tx.qualityJourneyExecutionCycle.count({
      where: { journeyId: journey.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    tx.qualityJourneyWorkItem.count({
      where: { journeyId: journey.id, id: { in: activeIds }, status: { in: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] } },
    }),
  ])
  const parsedReport = report ? qualityJourneyTriageReportSchema.parse(JSON.parse(report.reportJson)) : null
  const gates = closureGates({
    journey,
    report,
    blockers,
    running,
    unfinishedWork: completedActiveWork !== activeIds.length,
  })

  return { journey, closure, report, parsedReport, gates }
}

function closureGates({
  journey,
  report,
  blockers,
  running,
  unfinishedWork,
}: {
  journey: { stage: string; blockerIdsJson: string; unresolvedQuestionIdsJson: string }
  report: { review: unknown } | null
  blockers: number
  running: number
  unfinishedWork: boolean
}) {
  const gates: string[] = []
  if (journey.stage !== 'REPORT_REVIEW') gates.push('Terminal review requires the report review stage.')
  if (!report || report.review) gates.push('An unreviewed active report is required.')
  if (blockers || JSON.parse(journey.blockerIdsJson).length) gates.push('Resolve active blockers before closure.')
  if (JSON.parse(journey.unresolvedQuestionIdsJson).length) gates.push('Resolve required questions before closure.')
  if (running || unfinishedWork) gates.push('Finish active work and execution before closure.')
  return gates
}

export async function getQualityJourneyClosure(scope: Scope, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const context = await readClosureContext(scope, tx)
    return {
      receipt: context.closure ? journeyClosureSchema.parse(JSON.parse(context.closure.closureJson)) : null,
      contentHash: context.closure?.contentHash ?? null,
      reportRevisionId: context.report?.id ?? null,
      reportHash: context.report?.contentHash ?? null,
      unresolvedItems: context.parsedReport
        ? qualityJourneyClosureItems(
            context.parsedReport,
            context.report!.contentHash,
            JSON.parse(context.report!.assignment.inputJson) as TriageInput,
          )
        : [],
      blockers: context.gates,
    }
  })
}

type ClosureContext = Awaited<ReturnType<typeof readClosureContext>>
function validateFrozenReport(
  journey: ClosureContext['journey'],
  report: NonNullable<ClosureContext['report']>,
  parsedReport: NonNullable<ClosureContext['parsedReport']>,
  frozen: TriageInput,
) {
  validateFrozenContent(report, parsedReport, frozen)
  if (
    parsedReport.reportRevisionId !== report.id ||
    parsedReport.inputHash !== report.assignment.inputHash ||
    frozen.journeyId !== journey.id ||
    frozen.targetProjectId !== journey.targetProjectId ||
    parsedReport.cycleId !== journey.activeCycleId ||
    frozen.cycleId !== journey.activeCycleId ||
    parsedReport.executionCycleId !== report.assignment.executionCycleId
  )
    throw conflict('Report closure lineage is stale or corrupt.')
}

function validateFrozenContent(
  report: NonNullable<ClosureContext['report']>,
  parsedReport: NonNullable<ClosureContext['parsedReport']>,
  frozen: TriageInput,
) {
  if (
    hash({ report: parsedReport, source: frozen }) !== report.contentHash ||
    hash(frozen) !== report.assignment.inputHash
  )
    throw conflict('Report closure content hashes are corrupt.')
}

async function validateReportLineage(context: Awaited<ReturnType<typeof readClosureContext>>, tx: Db) {
  const { journey, report, parsedReport } = context
  if (!report || !parsedReport) throw conflict('An active report is required.')
  const frozen = JSON.parse(report.assignment.inputJson) as TriageInput
  validateFrozenReport(journey, report, parsedReport, frozen)
  const current = await compileQualityJourneyTriageInput(
    {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      executionCycleId: report.assignment.executionCycleId,
    },
    tx,
  )
  if (
    hash({ ...current, ...(frozen.predecessorReport ? { predecessorReport: frozen.predecessorReport } : {}) }) !==
    report.assignment.inputHash
  )
    throw conflict('Report source evidence changed after publication.')
  await validateApprovedAnalysis(journey, frozen, tx)
  validateQualityJourneyTriageReport(parsedReport, frozen)
  return { report, parsedReport, frozen }
}

async function validateApprovedAnalysis(journey: ClosureContext['journey'], frozen: TriageInput, tx: Db) {
  const analysis = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      artifactRevisionId: frozen.analysis.revisionId,
      contentHash: frozen.analysis.contentHash,
    },
    include: { decision: true, publication: true },
  })
  if (
    !analysis?.decision ||
    analysis.decision.decision !== 'APPROVED' ||
    !analysis.publication ||
    analysis.publication.artifactHash !== frozen.analysis.contentHash ||
    analysis.decision.reviewHash !== analysis.publication.reviewHash
  )
    throw conflict('Closure requires the exact published and approved analysis gate.')
}

function validateClosureRequest(
  context: ClosureContext,
  input: ReturnType<typeof qualityJourneyClosureInputSchema.parse>,
) {
  if (input.decision === 'CLOSED' && (input.rationale || input.acceptedItemIds.length))
    throw conflict('Ordinary closure cannot silently accept risk.')
  if (context.gates.length) throw conflict(context.gates.join(' '))
  if (
    context.journey.stateHash !== input.expectedStateHash ||
    context.report?.id !== input.reportRevisionId ||
    context.report.contentHash !== input.expectedReportHash
  )
    throw conflict('Closure must bind the exact current state and report.')
}

/** Local terminal approval. Actor identity is local possession, never a client assertion. */
export async function closeQualityJourney(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyClosureInputSchema.parse(value)
  const requestHash = hash(input)
  return client.$transaction(async tx => {
    const context = await readClosureContext(input, tx)
    if (context.closure) {
      if (context.closure.idempotencyKey !== input.idempotencyKey || context.closure.requestHash !== requestHash)
        throw conflict('This journey already has a different immutable closure.')
      return {
        receipt: journeyClosureSchema.parse(JSON.parse(context.closure.closureJson)),
        contentHash: context.closure.contentHash,
        replayed: true,
      }
    }
    validateClosureRequest(context, input)
    const { report, parsedReport, frozen } = await validateReportLineage(context, tx)
    const unresolvedItems = qualityJourneyClosureItems(parsedReport, report.contentHash, frozen)
    const closureId = idFor(input.journeyId, input.idempotencyKey)
    const closedAt = new Date().toISOString()
    const receipt = journeyClosureSchema.parse({
      schemaVersion: 'appraise.quality-journey/v1',
      closureId,
      journeyId: input.journeyId,
      cycleId: context.journey.activeCycleId,
      reportRevision: {
        kind: 'TEST_REPORT_ANALYSIS_REVISION',
        artifactId: report.id,
        revisionId: report.id,
        contentHash: report.contentHash,
      },
      decision: input.decision,
      actorId: 'USER',
      unresolvedItems,
      closedAt,
      ...(input.decision === 'RISK_ACCEPTED'
        ? {
            riskAcceptance: {
              rationale: input.rationale,
              acceptedItemIds: input.acceptedItemIds,
              acceptedAt: closedAt,
            },
          }
        : {}),
    })
    const contentHash = hash(receipt)
    await tx.qualityJourneyClosure.create({
      data: {
        id: closureId,
        journeyId: input.journeyId,
        reportRevisionId: report.id,
        cycleId: receipt.cycleId,
        reportHash: report.contentHash,
        contentHash,
        closureJson: json(receipt),
        idempotencyKey: input.idempotencyKey,
        requestHash,
        closedAt: new Date(closedAt),
      },
    })
    await tx.qualityJourneyArtifact.create({
      data: {
        id: closureId,
        identityKey: `JOURNEY_CLOSURE:${closureId}:unrevisioned`,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: receipt.cycleId,
        kind: 'JOURNEY_CLOSURE',
        artifactId: closureId,
        contentHash,
        artifactJson: json(receipt),
      },
    })
    await tx.qualityJourneyReportReview.create({
      data: {
        id: idFor('review', closureId),
        journeyId: input.journeyId,
        reportRevisionId: report.id,
        kind: input.decision,
        feedback: input.rationale ?? 'Exact report approved for terminal closure.',
        idempotencyKey: `closure:${input.idempotencyKey}`,
        requestHash,
      },
    })
    const closureRef = { kind: 'JOURNEY_CLOSURE', artifactId: closureId, contentHash }
    const link = journeyArtifactLinkSchema.parse({
      schemaVersion: 'appraise.quality-journey/v1',
      linkId: idFor('link', closureId),
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: receipt.cycleId,
      source: closureRef,
      target: receipt.reportRevision,
      relation: 'APPROVES',
    })
    await tx.qualityJourneyArtifactLink.create({
      data: {
        id: idFor('link', closureId),
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: receipt.cycleId,
        relation: link.relation,
        linkHash: hash(link),
        sourceJson: json(link.source),
        targetJson: json(link.target),
      },
    })
    const payload = {
      closureId,
      reportRevisionId: report.id,
      reportHash: report.contentHash,
      ...(receipt.riskAcceptance
        ? { rationale: receipt.riskAcceptance.rationale, acceptedItemIds: receipt.riskAcceptance.acceptedItemIds }
        : {}),
    }
    const result = await submitDurableQualityJourneyCommandInTransaction(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        command: input.decision === 'CLOSED' ? 'CLOSE_JOURNEY' : 'RISK_ACCEPT_AND_CLOSE',
        commandId: idFor('command', closureId),
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        actor: 'USER',
        expectedStateHash: input.expectedStateHash,
        idempotencyKey: `closure:${input.idempotencyKey}`,
        inputArtifactRefs: [receipt.reportRevision, closureRef],
        payload,
      },
      tx,
      true,
      false,
    )
    if (result.outcome !== 'COMMITTED') throw conflict('Closure could not commit against the current state.')
    return { receipt, contentHash, replayed: false }
  })
}
