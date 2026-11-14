import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { prepareM10AutomationFixture } from '../../../../src/test/m10-journey-fixture'
import { getQualityJourney } from '../../../../src/services/coordinator/quality-journey-service'
import {
  prepareQualityJourneyTriage,
  internalTriageReportRevisionId,
  readInternalTriagerAssignment,
} from '../../../../src/services/coordinator/quality-journey-triage-service'
import {
  compileQualityJourneyTriageInput,
  type TriageInput,
} from '../../../../src/services/coordinator/quality-journey-triage-input'
import { validateQualityJourneyTriageReport } from '../../../../src/services/coordinator/quality-journey-triage-validation'
import { createManagedQualityJourneyRoleDelivery } from '../../../../src/services/coordinator/quality-journey-managed-role-delivery'
import { readInternalWorkerAuthority } from '../../../../src/services/coordinator/quality-journey-internal-worker-authority'
import {
  closeQualityJourney,
  getQualityJourneyClosure,
} from '../../../../src/services/coordinator/quality-journey-closure-service'
import {
  qualityJourneyClosureInputSchema,
  qualityJourneyTriageReportSchema,
  type QualityJourneyTriageReport,
} from '../../../../src/lib/quality-journey'
import { driverDigest } from './native-driver-control.mts'
import type { NativeExecutionObservation } from './native-execution-state.mts'
import type { NativeLineageEvent } from './native-lineage.mts'

type Fixture = Awaited<ReturnType<typeof prepareM10AutomationFixture>>
type ScopedTriageInput = Awaited<ReturnType<typeof readInternalTriagerAssignment>> & { reportRevisionId: string }
const completePassEvidence = z
  .object({
    result: z.literal('PASSED'),
    status: z.literal('COMPLETED'),
    evidenceHealth: z.literal('valid'),
    missingArtifacts: z.array(z.never()),
  })
  .passthrough()
const fullyPassed = (run: TriageInput['runs'][number]) => completePassEvidence.safeParse(run.evidence).success
/** Conservative candidate from exact sealed inputs: a failed run alone supplies no causal attribution. */
export function nativeSealedReportCandidate(input: ScopedTriageInput): QualityJourneyTriageReport {
  const findings: QualityJourneyTriageReport['findings'] = input.runs
    .filter(run => !fullyPassed(run))
    .map(run => ({
      findingId: `m13-unresolved-${run.testRunId}`,
      testRunId: run.testRunId,
      evidenceReceiptId: run.evidenceReceiptId,
      scenarioRevisionId: run.scenarioRevisionId,
      requirementIds:
        input.scenarios.find(scenario => scenario.revisionId === run.scenarioRevisionId)?.intent.requirementIds ?? [],
      kind: 'INCONCLUSIVE',
      targetOutcome: 'NOT_EVALUATED',
      confidence: 'LOW',
      rationale:
        'The actual sealed run did not establish a fully evidenced pass. Terminal status alone does not establish its cause.',
      competingHypotheses: [
        'Target, execution environment, validation design, and validation realization require evidence review.',
      ],
      unresolved: true,
      postmortem: {
        observation: `The sealed run result is ${run.evidence.result} with evidence health ${run.evidence.evidenceHealth}.`,
        expectedBehavior: 'The exact approved scenario completes with valid sealed execution artifacts.',
        causalAnalysis: 'No causal attribution is inferred from terminal status alone.',
        nextAction: 'Review the sealed report and log before authorizing any separate remediation or rerun.',
      },
    }))
  const report = qualityJourneyTriageReportSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    reportRevisionId: input.reportRevisionId,
    executionCycleId: input.executionCycleId,
    cycleId: input.cycleId,
    inputHash: input.inputHash,
    ...(input.predecessorReport ? { predecessorReportRevisionId: input.predecessorReport.reportRevisionId } : {}),
    summary: findings.length
      ? 'The actual sealed execution requires evidence review; its cause remains unresolved.'
      : 'The exact actual execution passed with complete valid sealed evidence.',
    findings,
    coverage: input.analysis.content.requirements.map(requirement => {
      const scenarios = input.scenarios.filter(scenario =>
        scenario.intent.requirementIds?.includes(requirement.requirementId),
      )
      const runs = input.runs.filter(run => scenarios.some(scenario => scenario.revisionId === run.scenarioRevisionId))
      return {
        requirementId: requirement.requirementId,
        scenarioRevisionIds: scenarios.map(scenario => scenario.revisionId),
        testRunIds: runs.map(run => run.testRunId),
        outcome: findings.some(finding => finding.requirementIds.includes(requirement.requirementId))
          ? 'UNRESOLVED'
          : runs.length > 0 &&
              scenarios.every(scenario => runs.some(run => run.scenarioRevisionId === scenario.revisionId)) &&
              runs.every(fullyPassed)
            ? 'PASSED'
            : 'NOT_EVALUATED',
        rationale: 'Coverage is derived only from the exact approved scenarios and their sealed execution outcomes.',
      }
    }),
    residualRisks: findings.length
      ? ['Causal attribution remains unresolved; no corrective execution or rerun is authorized.']
      : [],
    recommendations: [
      'Retain the sealed evidence and review this exact report through the separate human report/closure control.',
    ],
  })
  validateQualityJourneyTriageReport(report, input)
  return report
}
export async function prepareNativeTriageSubject(f: Fixture, observed: NativeExecutionObservation) {
  const input = await f.client.$transaction(tx =>
    compileQualityJourneyTriageInput({ ...f.scope, executionCycleId: observed.cycleId }, tx),
  )
  if (
    input.runs.length !== 1 ||
    input.runs[0].testRunId !== observed.testRunId ||
    input.runs[0].receiptHash !== observed.receiptHash ||
    input.runs[0].evidenceReceiptId !== observed.receiptId
  )
    throw new Error('Exact sealed original execution input required')
  const subject = Object.freeze({
    version: 'M13_NATIVE_TRIAGE_PREPARED_V1',
    ...f.scope,
    executionCycleId: observed.cycleId,
    inputHash: driverDigest(input),
    sealedInput: input,
    nativeCaseAllocated: false,
    runtimeQualified: false,
    physicalQualified: false,
  })
  return Object.freeze({ subject, subjectDigest: driverDigest(subject) })
}
export async function prepareOriginalNativeTriager(
  f: Fixture,
  observed: NativeExecutionObservation,
  expectedSubjectDigest: string,
  assertParentCurrent: () => void,
): Promise<NativeLineageEvent> {
  assertParentCurrent()
  if ((await prepareNativeTriageSubject(f, observed)).subjectDigest !== expectedSubjectDigest)
    throw new Error('Original sealed triage subject changed')
  assertParentCurrent()
  await prepareQualityJourneyTriage({ ...f.scope, executionCycleId: observed.cycleId }, f.client, f.credentials)
  assertParentCurrent()
  const { workerBinding } = await f.admit('TRIAGER')
  assertParentCurrent()
  const assignment = await f.client.$transaction(async tx => {
    const authority = await readInternalWorkerAuthority(workerBinding, tx)
    return {
      ...(await readInternalTriagerAssignment(authority.journey, authority.item, tx)),
      reportRevisionId: internalTriageReportRevisionId(f.scope.journeyId, workerBinding.attemptId),
    }
  })
  assertParentCurrent()
  // The actual scoped canonical read is independently admitted; it grants no new work or provider turn.
  const reader = await createManagedQualityJourneyRoleDelivery({
    binding: workerBinding,
    canonicalDefinitions: f.canonicalDefinitions,
    client: f.client,
  })
  assertParentCurrent()
  const read = await reader.invoke({
    callId: `m13-triage-read-${randomUUID()}`,
    toolName: 'quality_journey_triage_get',
    arguments: {},
  })
  assertParentCurrent()
  if (driverDigest(read.result) !== driverDigest(assignment)) throw new Error('Original scoped Triager input changed')
  const candidate = nativeSealedReportCandidate(assignment)
  const { inputHash: _inputHash, ...report } = candidate
  void _inputHash
  const toolName = 'quality_journey_triage_submit'
  const args = { idempotencyKey: `m13-triage-submit-${workerBinding.attemptId}`, report }
  return Object.freeze({
    kind: 'TRIAGER',
    arguments: args,
    original: {
      binding: workerBinding,
      client: f.client,
      databasePath: f.databasePath,
      canonicalDefinitions: f.canonicalDefinitions,
      toolName,
      arguments: args,
      async directInvoke() {
        throw new Error('Original native Triager delivery must not be replayed')
      },
    },
  })
}
export type NativeClosureChoice = Readonly<{
  decision: 'CLOSED' | 'RISK_ACCEPTED'
  rationale?: string
  acceptedItemIds: string[]
}>
const closureChoiceSchema = qualityJourneyClosureInputSchema.pick({
  decision: true,
  rationale: true,
  acceptedItemIds: true,
})
export async function prepareNativeReportClosure(f: Fixture, provided: NativeClosureChoice) {
  const choice = closureChoiceSchema.parse(provided)
  const [closure, snapshot] = await Promise.all([
    getQualityJourneyClosure(f.scope, f.client),
    getQualityJourney(f.scope, f.client),
  ])
  if (!closure.reportRevisionId || !closure.reportHash || closure.blockers.length || closure.receipt)
    throw new Error('Exact unreviewed active report and closure gates required')
  const expectedIds = closure.unresolvedItems.map(item => item.itemId).sort()
  if (choice.decision === 'CLOSED' && expectedIds.length)
    throw new Error('Unresolved items require an explicit separate risk decision')
  if (
    choice.decision === 'RISK_ACCEPTED' &&
    (!choice.rationale || driverDigest([...choice.acceptedItemIds].sort()) !== driverDigest(expectedIds))
  )
    throw new Error('Exact unresolved risk item set and explicit rationale required')
  const request = qualityJourneyClosureInputSchema.parse({
    ...f.scope,
    reportRevisionId: closure.reportRevisionId,
    expectedReportHash: closure.reportHash,
    expectedStateHash: snapshot.journey.stateHash,
    idempotencyKey: `m13-report-close-${randomUUID()}`,
    ...structuredClone(choice),
  })
  const subject = Object.freeze({
    version: 'M13_NATIVE_REPORT_REVIEW_CLOSURE_V1',
    request,
    journeyVersion: snapshot.journey.version,
    ownershipVersion: snapshot.journey.ownershipVersion,
    unresolvedItems: closure.unresolvedItems,
    persona: 'SCRIPTED_DISPOSABLE_TEST_HUMAN',
    realHumanInteractionObserved: false,
    runtimeQualified: false,
    physicalQualified: false,
  })
  return Object.freeze({ subject, subjectDigest: driverDigest(subject) })
}
export function nativeReportQualityAssessment(document: QualityJourneyTriageReport) {
  return document.coverage.every(item => item.outcome === 'PASSED') &&
    !document.findings.length &&
    !document.residualRisks.length
    ? ('PASSED' as const)
    : ('NEEDS_WORK' as const)
}
export async function closeOriginalNativeReport(
  f: Fixture,
  prepared: Awaited<ReturnType<typeof prepareNativeReportClosure>>,
  observed: NativeExecutionObservation,
  assertParentCurrent: () => void,
) {
  assertParentCurrent()
  const closed = await closeQualityJourney(prepared.subject.request, f.client, f.credentials)
  assertParentCurrent()
  const snapshot = await getQualityJourney(f.scope, f.client)
  assertParentCurrent()
  const report = await f.client.qualityJourneyTriageReport.findUniqueOrThrow({
    where: { id: prepared.subject.request.reportRevisionId },
  })
  const document = qualityJourneyTriageReportSchema.parse(JSON.parse(report.reportJson))
  return Object.freeze({
    version: 'M13_NATIVE_REPORT_CLOSED_V1',
    closure: closed,
    journeyStage: snapshot.journey.stage,
    journeyStatus: snapshot.journey.status,
    testResult: observed.result,
    qualityAssessment: nativeReportQualityAssessment(document),
    qualityAssessmentBasis: 'EXACT_CANONICAL_REPORT_COVERAGE',
    humanWaitMetric: 'UNQUALIFIED',
    realHumanInteractionObserved: false,
    runtimeQualified: false,
    physicalQualified: false,
  })
}
