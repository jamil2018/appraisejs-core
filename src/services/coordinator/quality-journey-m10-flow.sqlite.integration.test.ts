import { afterEach, describe, expect, it, vi } from 'vitest'
import { callM10WorkerMcp, prepareM10AutomationFixture } from '@/test/m10-journey-fixture'
import {
  hashQualityJourneyExecutionValue as hash,
  qualityJourneyContractVersion,
  type QualityJourneyTriageReport,
} from '@/lib/quality-journey'
import type { TriageInput } from './quality-journey-triage-input'
import { createQualityJourneyInternalTriageGateway } from './quality-journey-internal-triage-gateway'
import {
  getQualityJourney,
  claimQualityJourneyWork,
  publishInternalRuntimeCycleResultInTransaction,
} from './quality-journey-service'
import { PrismaClient, type Prisma } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  grantQualityJourneyExecutionConsent,
  registerQualityJourneyExecutionRuntimeAdapter,
  resetQualityJourneyExecutionRuntimeAdapter,
  startQualityJourneyExecution,
  proposeQualityJourneyRerun,
  approveQualityJourneyRerun,
  startQualityJourneyRerun,
} from './quality-journey-execution-service'
import {
  reconcileQualityJourneyExecutionRuntime,
  reconcileSealedQualityJourneyExecutionRuntimeInTransaction,
} from './quality-journey-runtime-service'
import { pauseQualityJourneyOperational, resumeQualityJourneyOperational } from './quality-journey-recovery-service'
import {
  getQualityJourneyTriage,
  prepareQualityJourneyTriage,
  requestQualityJourneyReportRevision,
  submitExternalQualityJourneyTriageReport,
} from './quality-journey-triage-service'
import { closeQualityJourney } from './quality-journey-closure-service'

const fixtures: Awaited<ReturnType<typeof prepareM10AutomationFixture>>[] = []
type Fixture = (typeof fixtures)[number]
type Assignment = TriageInput & { inputHash: string; scopeHash: string; reportRevisionId: string }
const readTool = 'quality_journey_triage_get'
const evidenceTool = 'quality_journey_triage_evidence_read'
const submitTool = 'quality_journey_triage_submit'
afterEach(async () => {
  vi.useRealTimers()
  resetQualityJourneyExecutionRuntimeAdapter()
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})

async function preparation() {
  const f = await prepareM10AutomationFixture()
  fixtures.push(f)
  return f
}

/** Synthetic terminalization only: this lane does not launch a browser or fabricate runtime bytes. */
async function reserveSyntheticExecution(f: Fixture) {
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

async function failedExecution(f: Fixture) {
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

async function triager(f: Fixture) {
  const { worker, workerBinding } = await f.admit('TRIAGER')
  const gateway = await createQualityJourneyInternalTriageGateway(workerBinding, f.canonicalDefinitions, f.client)
  const ownership = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
  const { result: assignment } = await callM10WorkerMcp<Assignment>(gateway, readTool)
  expect((await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).ownershipVersion).toBe(
    ownership.ownershipVersion,
  )
  return { worker, workerBinding, gateway, assignment }
}

function report(input: Assignment): QualityJourneyTriageReport {
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

function mcpReport(document: QualityJourneyTriageReport) {
  return Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'inputHash'))
}

function externalSubmission(
  f: Fixture,
  t: Awaited<ReturnType<typeof triager>>,
  document: QualityJourneyTriageReport,
  key: string,
) {
  const source = Object.fromEntries(
    Object.entries(t.assignment).filter(([key]) => !['reportRevisionId', 'inputHash', 'scopeHash'].includes(key)),
  )
  const contentHash = hash({ report: document, source })
  return {
    ...f.scope,
    workItemId: t.workerBinding.workItemId,
    attemptId: t.workerBinding.attemptId,
    leaseId: t.workerBinding.leaseId,
    assignmentId: t.workerBinding.assignmentId,
    assignmentGeneration: t.workerBinding.assignmentGeneration,
    assignmentSecret: t.workerBinding.assignmentSecret,
    idempotencyKey: key,
    report: document,
    result: {
      schemaVersion: qualityJourneyContractVersion,
      assignmentId: t.workerBinding.assignmentId,
      workItemId: t.workerBinding.workItemId,
      attemptId: t.workerBinding.attemptId,
      role: 'TRIAGER',
      roleContractDigest: t.worker.workItem.roleContractDigest,
      inputHash: t.assignment.inputHash,
      status: 'COMPLETED',
      outputs: [
        {
          kind: 'TEST_REPORT_ANALYSIS_REVISION',
          artifactId: document.reportRevisionId,
          revisionId: document.reportRevisionId,
          contentHash,
        },
      ],
      evidenceReceipts: [],
      assumptions: [],
      blockers: [],
      unresolvedQuestions: [],
      submittedAt: new Date().toISOString(),
    },
  }
}

describe('M10 deterministic disposable Journey integration', () => {
  it('prepares a fresh legacy Journey through scoped MCP and exact human scenario approval without execution', async () => {
    const f = await preparation()
    expect(f.prepared).toHaveLength(1)
    expect(f.prepared[0]).toMatchObject({ status: 'PREPARED' })
    expect(await f.client.runtimeCapsule.count()).toBe(0)
    expect(await f.client.testRun.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  }, 30_000)

  it('defers sealed synthetic internal runtime evidence while paused and publishes exactly once after a client restart', async () => {
    const f = await preparation()
    const { cycle, run } = await reserveSyntheticExecution(f)
    const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    expect(before).toMatchObject({ hostingMode: 'APP_SERVER_LOCAL_V1', status: 'ACTIVE', stage: 'EXECUTION' })
    // Reuse the recovery suite's post-commit crash seam: pause authority persists,
    // while cleanup has not yet terminalized the inert RESERVED run.
    const crashingClient = new Proxy(f.client, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property)
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          await target.$transaction(callback)
          throw new Error('Injected process crash after pause commit, before cleanup')
        }
      },
    })
    await expect(
      pauseQualityJourneyOperational(
        {
          ...f.scope,
          expectedStateHash: before.stateHash,
          expectedVersion: before.version,
          idempotencyKey: 'm11-pause-synthetic-runtime',
          reason: 'Verify deferred internal publication without physical runtime effects.',
        },
        crashingClient,
      ),
    ).rejects.toThrow('Injected process crash')
    const paused = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    expect(paused).toMatchObject({
      status: 'PAUSED',
      stage: 'EXECUTION',
      stateHash: before.stateHash,
      version: before.version + 1,
    })
    expect(await f.client.qualityJourneyExecutionEvidenceReceipt.count()).toBe(0)
    // Only terminal status is synthetic. The production reconciler seals the bound receipt,
    // including its honest absence of report/log bytes; no browser or provider executes.
    await f.client.testRun.update({
      where: { id: run.testRunId },
      data: { status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' },
    })
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: cycle.id }, f.client)
    const sealed = await f.client.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
      where: { executionCycleId: cycle.id },
    })
    const storedCycle = await f.client.qualityJourneyExecutionCycle.findUniqueOrThrow({ where: { id: cycle.id } })
    const evidence = JSON.parse(sealed.evidenceJson)
    expect(evidence).toMatchObject({
      ...f.scope,
      executionCycleId: cycle.id,
      cycleId: storedCycle.cycleId,
      testRunId: run.testRunId,
      runId: run.runId,
      preparedCapsuleId: f.prepared[0]!.id,
      preparedCapsulesHash: storedCycle.preparedCapsulesHash,
      environmentSnapshotHash: storedCycle.environmentSnapshotHash,
      status: 'COMPLETED',
      result: 'FAILED',
      artifacts: [],
      missingArtifacts: ['report', 'log'],
    })
    expect(sealed.receiptHash).toBe(hash(evidence))
    expect(storedCycle.status).toBe('COMPLETED')
    expect(
      await f.client.$transaction(tx => reconcileSealedQualityJourneyExecutionRuntimeInTransaction(cycle.id, tx)),
    ).toBe(true)
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toMatchObject({
      status: 'PAUSED',
      stage: 'EXECUTION',
      stateHash: before.stateHash,
      version: paused.version,
    })
    const publicationWhere = { journeyId: f.scope.journeyId, idempotencyKey: `execution-result:${cycle.id}` }
    expect(await f.client.qualityJourneyCommand.count({ where: publicationWhere })).toBe(0)
    expect(await f.client.qualityJourneyEvent.count({ where: { eventType: 'COMMAND_PUBLISH_RUN_RESULT' } })).toBe(0)
    await f.client.$disconnect()
    const restarted = new PrismaClient({ datasources: { db: { url: `file:${f.databasePath}` } } })
    try {
      const resume = {
        ...f.scope,
        expectedStateHash: paused.stateHash,
        expectedVersion: paused.version,
        idempotencyKey: 'm11-resume-synthetic-runtime',
      }
      const resumed = await resumeQualityJourneyOperational(resume, restarted)
      expect(resumed).toMatchObject({ operationalStatus: 'ACTIVE', replayed: false, version: paused.version + 2 })
      const journey = await restarted.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      expect(journey).toMatchObject({ status: 'ACTIVE', stage: 'TRIAGE', version: resumed.version })
      expect(journey.stateHash).not.toBe(before.stateHash)
      const publication = await restarted.qualityJourneyCommand.findFirstOrThrow({ where: publicationWhere })
      expect(JSON.parse(publication.requestJson)).toMatchObject({
        command: 'PUBLISH_RUN_RESULT',
        actor: 'MANAGED_RUNTIME',
        payload: { testRunIds: [run.testRunId], evidenceReceiptIds: [sealed.id] },
      })
      const snapshot = async () => ({
        journey: await restarted.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }),
        commands: await restarted.qualityJourneyCommand.count(),
        events: await restarted.qualityJourneyEvent.count(),
        receipts: await restarted.qualityJourneyExecutionEvidenceReceipt.findMany(),
      })
      const accepted = await snapshot()
      expect(await resumeQualityJourneyOperational(resume, restarted)).toMatchObject({
        replayed: true,
        eventId: resumed.eventId,
        operationalStatus: 'ACTIVE',
        version: resumed.version,
      })
      expect(await snapshot()).toEqual(accepted)
      expect(accepted.receipts).toEqual([sealed])
      expect(await restarted.qualityJourneyCommand.count({ where: publicationWhere })).toBe(1)
      expect(await restarted.qualityJourneyEvent.count({ where: { eventType: 'COMMAND_PUBLISH_RUN_RESULT' } })).toBe(1)
      expect(await restarted.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_RESUME' } })).toBe(1)
      expect(await restarted.qualityJourneyProviderRun.count()).toBe(0)
    } finally {
      await restarted.$disconnect()
    }
  }, 30_000)

  it('shares exact report identity and lineage refusal across versioned ingress and scoped MCP', async () => {
    const f = await preparation()
    const execution = await failedExecution(f)
    await expect(claimQualityJourneyWork({ ...f.credentials, role: 'TRIAGER' }, f.client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    const t = await triager(f)
    expect(t.gateway.profile.tools.map(tool => tool.name)).toEqual([readTool, evidenceTool, submitTool])
    expect(t.assignment.runs.map(run => run.evidenceReceiptId)).toEqual([execution.receipt.id])
    const candidate = report(t.assignment)
    for (const invalid of [
      { ...candidate, reportRevisionId: 'worker-chosen-report-id' },
      { ...candidate, executionCycleId: 'foreign-execution' },
      { ...candidate, predecessorReportRevisionId: 'foreign-predecessor' },
      { ...candidate, findings: [{ ...candidate.findings[0]!, evidenceReceiptId: 'foreign-receipt' }] },
      { ...candidate, findings: [{ ...candidate.findings[0]!, testRunId: 'foreign-run' }] },
    ]) {
      const key = `m10-invalid-${hash(invalid).slice(7, 19)}`
      await expect(
        submitExternalQualityJourneyTriageReport(
          externalSubmission(f, t, invalid, key),
          f.principal,
          f.client,
          f.credentials,
        ),
      ).rejects.toThrow()
      await expect(
        callM10WorkerMcp(t.gateway, submitTool, { idempotencyKey: `${key}-mcp`, report: mcpReport(invalid) }),
      ).rejects.toThrow()
    }
    await expect(
      callM10WorkerMcp(t.gateway, evidenceTool, { receiptId: execution.receipt.id, artifactKind: 'report' }),
    ).rejects.toThrow()
    await expect(
      callM10WorkerMcp(t.gateway, evidenceTool, { receiptId: 'foreign-receipt', artifactKind: 'report' }),
    ).rejects.toThrow()
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(0)
    expect(
      await callM10WorkerMcp(t.gateway, submitTool, {
        idempotencyKey: 'm10-initial-report',
        report: mcpReport(candidate),
      }),
    ).toMatchObject({
      result: { reportRevisionId: candidate.reportRevisionId, replayed: false },
      receipt: { accepted: true },
    })
    await expect(
      submitExternalQualityJourneyTriageReport(
        externalSubmission(
          f,
          t,
          { ...candidate, summary: 'A different request cannot replay the accepted report.' },
          'm10-initial-report',
        ),
        f.principal,
        f.client,
        f.credentials,
      ),
    ).rejects.toThrow()
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(1)
  }, 30_000)

  it('rejects stale and foreign grants, preserves sealed evidence and requires a fresh successor report and rerun consent', async () => {
    const f = await preparation()
    const execution = await failedExecution(f)
    const t = await triager(f)
    await expect(
      createQualityJourneyInternalTriageGateway(
        { ...t.workerBinding, targetProjectId: 'foreign-project' },
        f.canonicalDefinitions,
        f.client,
      ),
    ).rejects.toThrow()
    await expect(
      createQualityJourneyInternalTriageGateway(
        { ...t.workerBinding, assignmentGeneration: t.workerBinding.assignmentGeneration + 1 },
        f.canonicalDefinitions,
        f.client,
      ),
    ).rejects.toThrow()
    await expect(
      t.gateway.callGateway({
        sealedGrant: `${t.gateway.sealedGrant}x`,
        profileDigest: t.gateway.profile.contractDigest,
        toolName: readTool,
        arguments: {},
      }),
    ).rejects.toThrow()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(t.worker.attempt.leaseExpiresAt.getTime() + 1))
    await expect(callM10WorkerMcp(t.gateway, readTool)).rejects.toThrow()
    vi.useRealTimers()
    await expect(
      f.client.qualityJourneyExecutionEvidenceReceipt.update({
        where: { id: execution.receipt.id },
        data: { evidenceJson: '{}' },
      }),
    ).rejects.toThrow()
    const initial = report(t.assignment)
    const accepted = await callM10WorkerMcp<{ contentHash: string }>(t.gateway, submitTool, {
      idempotencyKey: 'm10-review-initial',
      report: mcpReport(initial),
    })
    const current = await getQualityJourney(f.scope, f.client)
    await expect(
      requestQualityJourneyReportRevision(
        {
          ...f.scope,
          reportRevisionId: initial.reportRevisionId,
          expectedReportHash: hash('stale'),
          expectedStateHash: current.journey.stateHash,
          idempotencyKey: 'm10-review-stale',
          feedback: 'Review complete failed evidence.',
        },
        f.client,
        f.credentials,
      ),
    ).rejects.toThrow()
    await requestQualityJourneyReportRevision(
      {
        ...f.scope,
        reportRevisionId: initial.reportRevisionId,
        expectedReportHash: accepted.result.contentHash,
        expectedStateHash: current.journey.stateHash,
        idempotencyKey: 'm10-human-revision',
        feedback: 'Retain the evidence limits in the full report.',
      },
      f.client,
      f.credentials,
    )
    await expect(callM10WorkerMcp(t.gateway, readTool)).rejects.toThrow()
    const successor = await triager(f)
    expect(successor.assignment.predecessorReport).toMatchObject({
      reportRevisionId: initial.reportRevisionId,
      contentHash: accepted.result.contentHash,
      feedback: 'Retain the evidence limits in the full report.',
    })
    expect(successor.assignment.reportRevisionId).not.toBe(initial.reportRevisionId)
    expect(successor.assignment.runs).toEqual(t.assignment.runs)
    const revised = report(successor.assignment)
    await expect(
      callM10WorkerMcp(successor.gateway, submitTool, {
        idempotencyKey: 'm10-stale-revision',
        report: { ...mcpReport(revised), reportRevisionId: initial.reportRevisionId },
      }),
    ).rejects.toThrow()
    const exactRevision = externalSubmission(f, successor, revised, 'm10-revised-report')
    expect(
      await submitExternalQualityJourneyTriageReport(exactRevision, f.principal, f.client, f.credentials),
    ).toMatchObject({ replayed: false })
    expect(
      await submitExternalQualityJourneyTriageReport(exactRevision, f.principal, f.client, f.credentials),
    ).toMatchObject({ replayed: true })
    const active = await getQualityJourneyTriage(f.scope, f.client)
    expect(active.reports).toHaveLength(2)
    expect(active.activeReportRevisionId).toBe(revised.reportRevisionId)
    const proposal = await proposeQualityJourneyRerun(
      {
        ...f.scope,
        sourceCycleId: execution.cycle.id,
        sourceEvidenceReceiptIds: [execution.receipt.id],
        selectedScenarioRevisionIds: [f.scenarioRevisionId],
        reason: 'Observe a real execution in a fresh approved run.',
        idempotencyKey: 'm10-rerun-proposal',
      },
      f.client,
      f.credentials,
    )
    await approveQualityJourneyRerun(
      { ...f.scope, proposalId: proposal.id, expectedProposalHash: proposal.proposalHash },
      f.client,
      f.credentials,
    )
    const rerunRequest = {
      ...f.scope,
      proposalId: proposal.id,
      environmentId: f.environmentId,
      expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash,
      idempotencyKey: 'm10-rerun-start',
    }
    await expect(
      startQualityJourneyRerun({ ...rerunRequest, executionConsentId: execution.consent.id }, f.client, f.credentials),
    ).rejects.toThrow()
    const rerun = await startQualityJourneyRerun(rerunRequest, f.client, f.credentials)
    if (!('consentRequired' in rerun)) throw new Error('Rerun reused consumed execution consent')
    expect(rerun.consentRequired.executionConsentId).not.toBe(execution.consent.id)
    expect(await f.client.testRun.count()).toBe(1)
    expect(await f.client.qualityJourneyExecutionCycle.count()).toBe(1)
    const state = await getQualityJourney(f.scope, f.client)
    await expect(
      closeQualityJourney(
        {
          ...f.scope,
          reportRevisionId: initial.reportRevisionId,
          expectedReportHash: accepted.result.contentHash,
          expectedStateHash: state.journey.stateHash,
          idempotencyKey: 'm10-close-stale',
          decision: 'CLOSED',
          acceptedItemIds: [],
        },
        f.client,
        f.credentials,
      ),
    ).rejects.toThrow()
    expect(await f.client.qualityJourneyClosure.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  }, 30_000)
  it('refuses malformed, foreign, unsealed, paused and E2-associated internal runtime publication atomically', async () => {
    const f = await preparation()
    const { cycle, run } = await reserveSyntheticExecution(f)
    const storedCycle = await f.client.qualityJourneyExecutionCycle.findUniqueOrThrow({ where: { id: cycle.id } })
    const snapshot = async () => ({
      journey: await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }),
      cycle: await f.client.qualityJourneyExecutionCycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      run: await f.client.testRun.findUniqueOrThrow({ where: { id: run.testRunId } }),
      receipts: await f.client.qualityJourneyExecutionEvidenceReceipt.count(),
      commands: await f.client.qualityJourneyCommand.count(),
    })
    const before = await snapshot()
    const evidence = {
      schemaVersion: qualityJourneyContractVersion,
      ...f.scope,
      cycleId: storedCycle.cycleId,
      executionCycleId: cycle.id,
      testRunId: run.testRunId,
      runId: run.runId,
      preparedCapsuleId: f.prepared[0]!.id,
      preparedCapsulesHash: storedCycle.preparedCapsulesHash,
      environmentSnapshotHash: storedCycle.environmentSnapshotHash,
      status: 'COMPLETED',
      result: 'FAILED',
      evidenceHealth: 'valid',
      runtimeCapsuleId: null,
      runtimeCapsuleHash: null,
      manifestHash: null,
      attemptId: null,
      artifacts: [],
      missingArtifacts: ['report', 'log'],
    }
    const seedTerminal = async (tx: Prisma.TransactionClient, document: unknown = evidence, raw?: string) => {
      await tx.testRun.update({ where: { id: run.testRunId }, data: { status: 'COMPLETED', result: 'FAILED' } })
      await tx.qualityJourneyExecutionCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } })
      await tx.qualityJourneyExecutionEvidenceReceipt.create({
        data: {
          id: 'm10-child-synthetic-receipt',
          executionCycleId: cycle.id,
          testRunId: run.testRunId,
          evidenceJson: raw ?? canonicalContractJson(document),
          receiptHash: hash(document),
          runtimeBytesHash: hash([]),
        },
      })
    }
    const rejected = async (
      setup?: (tx: Prisma.TransactionClient) => Promise<void>,
      expectedId = cycle.id,
      expectedReason?: string,
    ) => {
      let reachedPublication = false
      const failure = await f.client
        .$transaction(async tx => {
          await setup?.(tx)
          reachedPublication = true
          return publishInternalRuntimeCycleResultInTransaction(expectedId, tx)
        })
        .then(
          () => undefined,
          error => error,
        )
      expect(failure).toBeInstanceOf(Error)
      expect(reachedPublication, String(failure)).toBe(true)
      if (expectedReason) expect(failure).toMatchObject({ details: { reason: expectedReason } })
      expect(await snapshot()).toEqual(before)
    }
    await rejected(undefined, 'm10-foreign-cycle')
    await rejected()
    await rejected(async tx => {
      await tx.qualityJourneyExecutionCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED' } })
    })
    await rejected(tx => seedTerminal(tx, evidence, '{'))
    for (const changed of [
      { ...evidence, journeyId: 'foreign-journey' },
      { ...evidence, testRunId: 'foreign-run' },
      { ...evidence, runId: 'foreign-runtime-run' },
      { ...evidence, preparedCapsuleId: 'foreign-prepared' },
      { ...evidence, environmentSnapshotHash: hash('foreign-environment') },
      { ...evidence, result: 'PASSED' },
    ])
      await rejected(tx => seedTerminal(tx, changed))
    await rejected(async tx => {
      await seedTerminal(tx)
      await tx.testRun.update({ where: { id: run.testRunId }, data: { status: 'RUNNING' } })
    })
    await rejected(async tx => {
      await seedTerminal(tx)
      await tx.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { status: 'PAUSED' } })
    })
    await rejected(
      async tx => {
        await seedTerminal(tx)
        const session = await tx.qualityJourneyCoordinatorSession.findUniqueOrThrow({
          where: { id: f.credentials.coordinatorSessionId },
        })
        const enrolled = await tx.qualityJourneyCoordinatorSession.create({
          data: {
            ...session,
            id: 'm10-e2-associated-session',
            registrationKey: 'm10-e2-associated-register',
            transitionRequestId: 'm10-e2-associated-transition',
            generation: 2,
            e2EnrollmentKind: 'E2_V1',
            e2EnrollmentDigest: 'a'.repeat(64),
            e2EnrolledAt: new Date(),
          },
        })
        await tx.qualityJourney.update({
          where: { id: f.scope.journeyId },
          data: { currentCoordinatorSessionId: enrolled.id },
        })
      },
      cycle.id,
      'UNSUPPORTED_E2_INVALIDATION',
    )
    // Real reconciler acceptance after all aborted transactions proves the fixture was not poisoned.
    await f.client.testRun.update({
      where: { id: run.testRunId },
      data: { status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' },
    })
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: cycle.id }, f.client)
    expect(await f.client.qualityJourneyExecutionEvidenceReceipt.count()).toBe(1)
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('TRIAGE')
  }, 30_000)
})
