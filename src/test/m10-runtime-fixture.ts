/** Shared fresh synthetic runtime/triage setup; never launches a browser or provider. */
import { expect, vi } from 'vitest'
import { callM10WorkerMcp, prepareM10AutomationFixture } from './m10-journey-fixture'
import {
  hashQualityJourneyExecutionValue as hash,
  qualityJourneyContractVersion,
  type QualityJourneyTriageReport,
} from '@/lib/quality-journey'
import type { TriageInput } from '@/services/coordinator/quality-journey-triage-input'
import { createQualityJourneyInternalTriageGateway } from '@/services/coordinator/quality-journey-internal-triage-gateway'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import {
  grantQualityJourneyExecutionConsent,
  registerQualityJourneyExecutionRuntimeAdapter,
  startQualityJourneyExecution,
} from '@/services/coordinator/quality-journey-execution-service'
import { reconcileQualityJourneyExecutionRuntime } from '@/services/coordinator/quality-journey-runtime-service'
import { prepareQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
type Fixture = Awaited<ReturnType<typeof prepareM10AutomationFixture>>
type M10TriageAssignment = TriageInput & { inputHash: string; scopeHash: string; reportRevisionId: string }
type Assignment = M10TriageAssignment
const readTool = 'quality_journey_triage_get'

/** Synthetic terminalization only: this lane does not launch a browser or fabricate runtime bytes. */
export async function reserveSyntheticExecution(f: Fixture) {
  registerQualityJourneyExecutionRuntimeAdapter({
    start: async () => undefined,
    cancel: async () => undefined,
    reconcile: async () => undefined,
  })
  const request = {
    ...f.scope,
    preparedRuntimeCapsuleIds: f.prepared.map(item => item.id),
    environmentId: f.environmentId,
    expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash,
    idempotencyKey: 'm10-synthetic-execution',
  }
  const waiting = await startQualityJourneyExecution(request, f.client, f.credentials)
  if (!('consentRequired' in waiting)) throw new Error('M10 reload must require exact UI execution consent')
  expect(await f.client.testRun.count()).toBe(0)
  await expect(
    grantQualityJourneyExecutionConsent(
      {
        ...f.scope,
        executionConsentId: waiting.consentRequired.executionConsentId,
        expectedScopeHash: hash('wrong-scope'),
      },
      f.client,
      f.credentials,
    ),
  ).rejects.toThrow()
  const consent = await grantQualityJourneyExecutionConsent(
    {
      ...f.scope,
      executionConsentId: waiting.consentRequired.executionConsentId,
      expectedScopeHash: waiting.consentRequired.scopeHash,
    },
    f.client,
    f.credentials,
  )
  if (!consent.expiresAt) throw new Error('Fixture grant must expire')
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(consent.expiresAt.getTime() + 1))
    await expect(
      startQualityJourneyExecution({ ...request, executionConsentId: consent.id }, f.client, f.credentials),
    ).rejects.toMatchObject({ message: 'Execution consent is unavailable.' })
  } finally {
    vi.useRealTimers()
  }
  expect(await f.client.testRun.count()).toBe(0)
  expect(await f.client.qualityJourneyExecutionCycle.count()).toBe(0)
  const started = await startQualityJourneyExecution(request, f.client, f.credentials)
  if ('consentRequired' in started) throw new Error('Granted execution did not reserve its exact scope')
  const cycle = started.cycles[0]!
  const run = cycle.testRuns[0]!
  await expect(
    prepareQualityJourneyTriage({ ...f.scope, executionCycleId: cycle.id }, f.client, f.credentials),
  ).rejects.toThrow()
  expect(await f.client.qualityJourneyTriageAssignment.count()).toBe(0)
  return { cycle, run, consent }
}

export async function failedExecution(f: Fixture) {
  const { cycle, run, consent } = await reserveSyntheticExecution(f)
  await f.client.testRun.update({
    where: { id: run.testRunId },
    data: { status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' },
  })
  await reconcileQualityJourneyExecutionRuntime({ executionCycleId: cycle.id }, f.client)
  const prepared = await prepareQualityJourneyTriage(
    { ...f.scope, executionCycleId: cycle.id },
    f.client,
    f.credentials,
  )
  expect(prepared.assignments).toHaveLength(1)
  expect(await f.client.runtimeCapsule.count()).toBe(0)
  const receipt = await f.client.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
    where: { executionCycleId: cycle.id },
  })
  expect(JSON.parse(receipt.evidenceJson)).toMatchObject({
    result: 'FAILED',
    artifacts: [],
    missingArtifacts: ['report', 'log'],
  })
  return { cycle, run, consent, receipt }
}

export async function triager(f: Fixture) {
  const { worker, workerBinding } = await f.admit('TRIAGER')
  const gateway = await createQualityJourneyInternalTriageGateway(workerBinding, f.canonicalDefinitions, f.client)
  const ownership = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
  const { result: assignment } = await callM10WorkerMcp<Assignment>(gateway, readTool)
  expect((await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).ownershipVersion).toBe(
    ownership.ownershipVersion,
  )
  return { worker, workerBinding, gateway, assignment }
}

export function report(input: Assignment): QualityJourneyTriageReport {
  const run = input.runs[0]!
  return {
    schemaVersion: qualityJourneyContractVersion,
    reportRevisionId: input.reportRevisionId,
    executionCycleId: input.executionCycleId,
    cycleId: input.cycleId,
    inputHash: input.inputHash,
    ...(input.predecessorReport ? { predecessorReportRevisionId: input.predecessorReport.reportRevisionId } : {}),
    summary: 'The synthetic terminal run has no sealed runtime artifact bytes; target outcome remains unevaluated.',
    findings: [
      {
        findingId: `m10-inconclusive-${input.reportRevisionId}`,
        testRunId: run.testRunId,
        evidenceReceiptId: run.evidenceReceiptId,
        scenarioRevisionId: run.scenarioRevisionId,
        requirementIds: ['REQ-M10-CHECKOUT'],
        kind: 'INCONCLUSIVE',
        targetOutcome: 'NOT_EVALUATED',
        confidence: 'HIGH',
        rationale: 'The inert runtime fixture supplies no browser observation.',
        competingHypotheses: ['Target behavior and runtime behavior remain unobserved.'],
        unresolved: true,
        postmortem: {
          observation: 'The synthetic run failed without runtime artifacts.',
          expectedBehavior: 'Managed execution produces sealed report and log bytes.',
          causalAnalysis: 'The deterministic adapter intentionally has no physical effects.',
          nextAction: 'Use the separate real RuntimeCapsule verification lane.',
        },
      },
    ],
    coverage: [
      {
        requirementId: 'REQ-M10-CHECKOUT',
        scenarioRevisionIds: [run.scenarioRevisionId],
        testRunIds: [run.testRunId],
        outcome: 'UNRESOLVED',
        rationale: 'No physical execution evidence exists in this lane.',
      },
    ],
    residualRisks: ['Target behavior is unobserved.'],
    recommendations: ['Execute the disposable runtime lane.'],
  }
}

export function mcpReport(document: QualityJourneyTriageReport) {
  return Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'inputHash'))
}
