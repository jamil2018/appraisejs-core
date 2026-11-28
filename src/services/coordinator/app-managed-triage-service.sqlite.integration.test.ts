import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareM10AutomationFixture } from '@/test/m10-journey-fixture'
import { failedExecution, reserveSyntheticExecution } from '@/test/m10-runtime-fixture'
import { reconcileQualityJourneyExecutionRuntime } from './quality-journey-runtime-service'
import { resetQualityJourneyExecutionRuntimeAdapter } from './quality-journey-execution-service'
import { getQualityJourney } from './quality-journey-service'
import { startAppManagedTriage } from './app-managed-triage-service'
import { z } from 'zod'
import { getAppManagedTriageRecovery, recoverAppManagedTriage } from './app-managed-triage-recovery'

const sender = vi.hoisted(() => ({
  run: vi.fn(),
  claudeRun: vi.fn(),
  claudeBind: vi.fn(),
  rejectSubmission: false,
  loseAcceptedReply: false,
}))
vi.mock('./quality-journey-managed-role-delivery', async importOriginal => {
  const actual = await importOriginal<typeof import('./quality-journey-managed-role-delivery')>()
  return {
    ...actual,
    createManagedQualityJourneyRoleDelivery: async (
      ...args: Parameters<typeof actual.createManagedQualityJourneyRoleDelivery>
    ) => {
      const delivery = await actual.createManagedQualityJourneyRoleDelivery(...args)
      return {
        ...delivery,
        invoke: async (call: Parameters<typeof delivery.invoke>[0]) => {
          if (call.toolName === 'quality_journey_triage_submit' && sender.rejectSubmission) {
            sender.rejectSubmission = false
            throw new Error('Simulated ambiguous submit response')
          }
          const result = await delivery.invoke(call)
          if (call.toolName === 'quality_journey_triage_submit' && sender.loseAcceptedReply) {
            sender.loseAcceptedReply = false
            throw new Error('Simulated lost canonical acceptance response')
          }
          return result
        },
      }
    },
  }
})
vi.mock('@/lib/quality-journey/codex-app-server/managed-analysis-sender', () => ({
  runManagedAnalysis: sender.run,
  inspectManagedCodexPrerequisites: async () => ({ usableForDispatch: true, state: 'candidate' }),
  classifyManagedAnalysisFailure: () => 'Managed native outcome UNKNOWN',
}))
vi.mock(import('@/services/provider-connection/claude-code-journey-sender'), async importOriginal => ({
  ...(await importOriginal()),
  bindClaudeCodeJourneySender: sender.claudeBind,
}))
const fixtures: Awaited<ReturnType<typeof prepareM10AutomationFixture>>[] = []
beforeEach(() => {
  vi.stubEnv('APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED', 'true')
  sender.run.mockReset()
  sender.claudeRun.mockReset()
  sender.claudeBind.mockReset().mockImplementation(async () => ({
    identity: {
      executableSha256: 'a'.repeat(64),
      accountFingerprint: 'b'.repeat(64),
      protocol: 'claude-code-print/v1',
    },
    run: sender.claudeRun,
  }))
  sender.rejectSubmission = false
  sender.loseAcceptedReply = false
})
afterEach(async () => {
  vi.unstubAllEnvs()
  resetQualityJourneyExecutionRuntimeAdapter()
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})

async function ready(specialized = true) {
  const f = await prepareM10AutomationFixture()
  fixtures.push(f)
  const execution = specialized
    ? await failedExecution(f)
    : await (async () => {
        const reserved = await reserveSyntheticExecution(f)
        await f.client.testRun.update({
          where: { id: reserved.run.testRunId },
          data: { status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' },
        })
        await reconcileQualityJourneyExecutionRuntime({ executionCycleId: reserved.cycle.id }, f.client)
        const receipt = await f.client.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
          where: { executionCycleId: reserved.cycle.id },
        })
        return { ...reserved, receipt }
      })()
  const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
  // Synthetic fixture arrangement only: all antecedent role attempts are terminal.
  // No live coordinator transfer, physical runtime, or host qualification is claimed.
  await f.client.qualityJourneyCoordinatorSession.update({
    where: { id: journey.currentCoordinatorSessionId! },
    data: { ownerPrincipalId: `appraise-local:${f.scope.targetProjectId}` },
  })
  return { ...f, execution, input: { ...f.scope, expectedStateHash: journey.stateHash } }
}

function output(prompt: string) {
  const context = z
    .object({
      submissionIdempotencyKey: z.string(),
      assignment: z.object({
        runs: z.array(
          z.object({ testRunId: z.string(), evidenceReceiptId: z.string(), scenarioRevisionId: z.string() }),
        ),
      }),
    })
    .parse(JSON.parse(prompt.split('\n\n').at(-1)!))
  const run = context.assignment.runs[0]!
  return JSON.stringify({
    toolName: 'quality_journey_triage_submit',
    arguments: {
      idempotencyKey: context.submissionIdempotencyKey,
      report: {
        summary: 'No runtime artifacts were produced by this synthetic execution. Target behavior remains unevaluated.',
        findings: [
          {
            findingId: 'inconclusive-run',
            ...run,
            requirementIds: ['REQ-M10-CHECKOUT'],
            kind: 'INCONCLUSIVE',
            targetOutcome: 'NOT_EVALUATED',
            confidence: 'HIGH',
            rationale: 'Sealed report and log artifacts are absent.',
            competingHypotheses: ['Target and runtime behavior were not physically observed.'],
            unresolved: true,
            postmortem: {
              observation: 'The synthetic adapter returned no runtime bytes.',
              expectedBehavior: 'Sealed runtime artifacts exist.',
              causalAnalysis: 'The fixture has no physical effects.',
              nextAction: 'Obtain separately authorized execution evidence.',
            },
          },
        ],
        coverage: [
          {
            requirementId: 'REQ-M10-CHECKOUT',
            scenarioRevisionIds: [run.scenarioRevisionId],
            testRunIds: [run.testRunId],
            outcome: 'UNRESOLVED',
            rationale: 'Target behavior remains unobserved.',
          },
        ],
        residualRisks: ['Target outcome remains unevaluated.'],
        recommendations: ['Inspect actual sealed runtime evidence.'],
      },
    },
  })
}

describe('local managed Triager on migrated SQLite', () => {
  it('uses Claude for the sealed report with Codex triage disabled and preserves its dispatch identity', async () => {
    const f = await ready()
    await f.client.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { managedWorkerProvider: 'CLAUDE_CODE' },
    })
    vi.stubEnv('APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED', 'false')
    vi.stubEnv('APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED', 'true')
    sender.claudeRun.mockImplementation(output)
    await expect(startAppManagedTriage(f.input, f.client)).resolves.toMatchObject({ accepted: true })
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.scope.journeyId, role: 'TRIAGER' } },
    })
    expect(attempt.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_TRIAGE')
    expect(JSON.parse(attempt.managedDispatchIdentityJson!)).toMatchObject({ provider: 'CLAUDE_CODE' })
    expect(sender.claudeRun).toHaveBeenCalledOnce()
    expect(sender.run).not.toHaveBeenCalled()
  }, 30_000)

  it('reconciles a lost acceptance response from the original receipt without resubmission or native work', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.loseAcceptedReply = true
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow('UNKNOWN')
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(1)
    const recovery = await getAppManagedTriageRecovery(f.scope, f.client)
    expect(recovery).not.toBeNull()
    const current = await getQualityJourney(f.scope, f.client)
    expect(
      await recoverAppManagedTriage(
        { ...f.scope, expectedStateHash: current.journey.stateHash, ...recovery! },
        f.client,
      ),
    ).toEqual({ accepted: true, nativeSend: false })
    expect(sender.run).toHaveBeenCalledOnce()
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(1)
  }, 30_000)
  it('retains the exact validated report and permits one canonical-only recovery after submission interruption', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.rejectSubmission = true
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow('UNKNOWN')
    const recovery = await getAppManagedTriageRecovery(f.scope, f.client)
    expect(recovery).not.toBeNull()
    expect(JSON.stringify(recovery)).not.toContain('candidate"')
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({
      senderCleanupVerified: true,
      recoveryEligible: true,
      candidate: { toolName: 'quality_journey_triage_submit' },
    })
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(0)
    await expect(
      recoverAppManagedTriage({ ...f.input, ...recovery!, candidateHash: `sha256:${'0'.repeat(64)}` }, f.client),
    ).rejects.toThrow('unused retained')
    const result = await recoverAppManagedTriage({ ...f.input, ...recovery! }, f.client)
    expect(result).toEqual({ accepted: true, nativeSend: false })
    expect(sender.run).toHaveBeenCalledOnce()
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('REPORT_REVIEW')
    expect(await getAppManagedTriageRecovery(f.scope, f.client)).toBeNull()
    const completed = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    expect(completed.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_TRIAGE')
    expect(completed.dispatchStartedAt).toBeNull()
    expect(JSON.parse(completed.failureJson!)).toMatchObject({
      canonicalRecoveryOutcome: 'ACCEPTED',
      canonicalRecoveryUsed: true,
      candidateHash: recovery!.candidateHash,
    })
    expect(await f.client.qualityJourneyReportReview.count()).toBe(0)
    expect(await f.client.qualityJourneyClosure.count()).toBe(0)
  }, 30_000)
  it('uses the exact sealed assignment and publishes only the normal human report review gate', async () => {
    const f = await ready(false)
    expect(await f.client.qualityJourneyTriageAssignment.count()).toBe(0)
    sender.run.mockImplementation(output)
    const sealedBefore = await f.client.qualityJourneyExecutionEvidenceReceipt.findMany()
    const testsBefore = await f.client.testRun.count(),
      consentBefore = await f.client.qualityJourneyExecutionConsent.count()
    await expect(startAppManagedTriage(f.input, f.client)).resolves.toMatchObject({ accepted: true })
    expect(sender.run).toHaveBeenCalledTimes(1)
    const prompt = String(sender.run.mock.calls[0]![0])
    expect(prompt).toContain(f.execution.receipt.receiptHash)
    expect(prompt).toContain('"missingArtifacts":["report","log"]')
    expect(prompt).toContain('"sealedTextEvidence":[]')
    expect(prompt).not.toContain('assignmentSecret')
    expect(prompt).not.toContain('ownerToken')
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('REPORT_REVIEW')
    const stored = await f.client.qualityJourneyTriageReport.findFirstOrThrow({
      where: { journeyId: f.scope.journeyId },
    })
    expect(JSON.parse(stored.reportJson).coverage[0].outcome).toBe('UNRESOLVED')
    expect(await f.client.qualityJourneyReportReview.count()).toBe(0)
    expect(await f.client.qualityJourneyClosure.count()).toBe(0)
    expect(await f.client.qualityJourneyExecutionEvidenceReceipt.findMany()).toEqual(sealedBefore)
    expect(await f.client.testRun.count()).toBe(testsBefore)
    expect(await f.client.qualityJourneyExecutionConsent.count()).toBe(consentBefore)
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('retains UNKNOWN native dispatch evidence across a database reopen and never replays the send', async () => {
    const f = await ready()
    sender.run.mockRejectedValue(new Error('native UNKNOWN with private content'))
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow('UNKNOWN')
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.scope.journeyId, role: 'TRIAGER' } },
    })
    expect(attempt.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_TRIAGE')
    expect(attempt.dispatchStartedAt).not.toBeNull()
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({ state: 'UNKNOWN', stage: 'NATIVE_SEND' })
    expect(attempt.failureJson).not.toContain('private content')
    expect(await getAppManagedTriageRecovery(f.scope, f.client)).toBeNull()
    await expect(startAppManagedTriage(f.input, f.connect())).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(0)
  }, 30_000)

  it('rejects stale state before native effects', async () => {
    const f = await ready()
    await expect(
      startAppManagedTriage({ ...f.input, expectedStateHash: `sha256:${'f'.repeat(64)}` }, f.client),
    ).rejects.toThrow('changed')
    expect(sender.run).not.toHaveBeenCalled()
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { role: 'TRIAGER' } } })).toBe(0)
  }, 30_000)

  it('rejects model-supplied report identities and retains its consumed dispatch', async () => {
    const f = await ready()
    sender.run.mockImplementation((prompt: string) => {
      const call = JSON.parse(output(prompt))
      call.arguments.report.reportRevisionId = 'model-chosen-identity'
      return JSON.stringify(call)
    })
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow('UNKNOWN')
    expect(await f.client.qualityJourneyTriageReport.count()).toBe(0)
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('allows only the original native send under concurrent dispatch requests', async () => {
    const f = await ready()
    let release!: (value: string) => void
    sender.run.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          release = resolve
        }),
    )
    const first = startAppManagedTriage(f.input, f.client)
    await vi.waitFor(() => expect(sender.run).toHaveBeenCalledTimes(1))
    await expect(startAppManagedTriage(f.input, f.client)).rejects.toThrow()
    release(output(String(sender.run.mock.calls[0]![0])))
    await expect(first).resolves.toMatchObject({ accepted: true })
    expect(sender.run).toHaveBeenCalledTimes(1)
  }, 30_000)
})
