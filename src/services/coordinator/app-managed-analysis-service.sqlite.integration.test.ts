import * as analysisService from './quality-journey-analysis-service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  createAppManagedJourney,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import { startAppManagedAnalysis } from './app-managed-analysis-service'
import {
  answerQualityJourneyAnalysisQuestion,
  requestQualityJourneyAnalysisRevision,
  getQualityJourneyAnalysis,
} from './quality-journey-analysis-service'
import { formatAnalysisFeedback } from '@/lib/quality-journey/analysis-feedback'
import { toAnalysisRevisionView } from '@/app/(base)/quality-journeys/[journeyId]/quality-journey-view-model'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import {
  getAppManagedAnalysisRetainedRecovery,
  recoverAppManagedAnalysisRetained,
} from './app-managed-analysis-retained-recovery'
import { ServiceError } from '@/services/shared/errors'

const sender = vi.hoisted(() => ({
  run: vi.fn(),
  handoffFault: '' as '' | 'BEFORE' | 'AFTER',
  publicationFault: false,
  holdSubmission: false,
  submissionBlocked: false,
  releaseSubmission: undefined as (() => void) | undefined,
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
          if (call.toolName === 'quality_journey_analysis_submit' && sender.holdSubmission) {
            sender.submissionBlocked = true
            await new Promise<void>(resolve => {
              sender.releaseSubmission = resolve
            })
          }
          if (call.toolName === 'quality_journey_analysis_submit' && sender.handoffFault === 'BEFORE') {
            sender.handoffFault = ''
            throw new Error('private transport narrative', {
              cause: new ServiceError(
                'Exact canonical submission interrupted.\nhttps://private.example/value',
                'INTERNAL',
              ),
            })
          }
          const result = await delivery.invoke(call)
          if (call.toolName === 'quality_journey_analysis_submit' && sender.handoffFault === 'AFTER') {
            sender.handoffFault = ''
            throw new Error('Original accepted response was lost')
          }
          return result
        },
      }
    },
  }
})
vi.mock('./quality-journey-analysis-service', async importOriginal => {
  const actual = await importOriginal<typeof import('./quality-journey-analysis-service')>()
  return {
    ...actual,
    publishQualityJourneyAnalysis: async (...args: Parameters<typeof actual.publishQualityJourneyAnalysis>) => {
      const result = await actual.publishQualityJourneyAnalysis(...args)
      if (sender.publicationFault) {
        sender.publicationFault = false
        throw new Error('Original published response was lost')
      }
      return result
    },
  }
})
vi.mock('@/lib/quality-journey/codex-app-server/managed-analysis-sender', () => ({
  runManagedAnalysis: sender.run,
  classifyManagedAnalysisFailure: () => 'Managed Analysis failed; outcome UNKNOWN',
}))
const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
beforeEach(() => {
  vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
  sender.run.mockReset()
  sender.handoffFault = ''
  sender.publicationFault = false
  sender.holdSubmission = false
  sender.submissionBlocked = false
  sender.releaseSubmission = undefined
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})

async function ready(existing?: Awaited<ReturnType<typeof createProviderFixture>>, key = 'real-ui-analysis') {
  const f = existing ?? (await createProviderFixture())
  if (!existing) fixtures.push(f)
  const created = await createAppManagedJourney(
    {
      targetProjectId: f.scope.targetProjectId,
      idempotencyKey: key,
      requirement: { objective: 'A shopper can pay for an order.', context: 'Cards only.' },
    },
    f.client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId: f.scope.targetProjectId }
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...scope,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      commandId: `${key}-submit-brief`,
      idempotencyKey: `${key}-submit-brief`,
      expectedStateHash: created.journey.stateHash,
      inputArtifactRefs: [],
      payload: {
        journeyRevisionId: created.journey.activeRevisionIds.journey,
        requirementHash: (
          await f.client.qualityJourneyRevision.findUniqueOrThrow({
            where: { id: created.journey.activeRevisionIds.journey },
          })
        ).contentHash,
      },
    },
    f.client,
    trustedHumanCoordinatorSession,
  )
  const current = await getQualityJourney(scope, f.client)
  return { ...f, scope, input: { ...scope, expectedStateHash: current.journey.stateHash } }
}

function output(prompt: string, requiredQuestion = false) {
  const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
  return JSON.stringify({
    toolName: 'quality_journey_analysis_submit',
    arguments: {
      idempotencyKey: context.submissionIdempotencyKey,
      ...(context.followup ? { predecessorAnalysisRevisionId: context.followup.predecessorAnalysisRevisionId } : {}),
      charter: {
        charterId: context.followup ? 'real-analysis-charter-2' : 'real-analysis-charter',
        analysisRevisionId: context.followup ? 'real-analysis-revision-2' : 'real-analysis-revision',
        cycleId: context.cycleId,
        requirementRevisionId: context.requirementRevisionId,
        objectives: ['A shopper can pay for an order.'],
        scope: { included: ['Card checkout'], excluded: ['Cash payments'] },
        actors: ['Shopper'],
        requirements: [
          {
            requirementId: 'REQ-PAYMENT',
            statement: 'A shopper pays by card.',
            sourceRefs: ['intake.objective', 'intake.context'],
          },
        ],
        obligations: [
          {
            obligationId: 'OBL-PAYMENT',
            requirementId: 'REQ-PAYMENT',
            statement: 'Card payment creates an order.',
            acceptanceSignals: ['The order confirmation is displayed.'],
          },
        ],
        constraints: ['Cards only.'],
        assumptions: [],
        risks: ['Duplicate payment'],
        acceptanceSignals: ['The order confirmation is displayed.'],
        retiredRequirementIds: [],
        questions: requiredQuestion
          ? [
              {
                questionId: 'QUESTION-CURRENCY',
                prompt: 'Which currency is supported?',
                required: true,
                rationale: 'Currency affects payment validation.',
              },
            ]
          : [],
        resolvedQuestionAnswerIds:
          context.followup?.questions.flatMap((question: { currentAnswer: { data: { answerId: string } } | null }) =>
            question.currentAnswer ? [question.currentAnswer.data.answerId] : [],
          ) ?? [],
      },
    },
  })
}

describe('local managed Analysis dispatch', () => {
  it('does not offer expired pre-acceptance delivery and preserves its proposal for separate correction authority', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.handoffFault = 'BEFORE'
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    const recovery = await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: { leaseExpiresAt: new Date(0) },
    })
    expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
    await expect(recoverAppManagedAnalysisRetained({ ...f.input, ...recovery! }, f.client)).rejects.toThrow(
      'unused retained',
    )
    const after = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(after.failureJson).toBe(attempt.failureJson)
    expect(await f.client.qualityJourneyAnalysisRevision.count({ where: f.scope })).toBe(0)
    expect(sender.run).toHaveBeenCalledOnce()
  }, 30_000)
  it('recovers an interrupted retained handoff after its lease expires using original canonical acceptance', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.handoffFault = 'AFTER'
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    const recovery = await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    const state = JSON.parse(attempt.failureJson!)
    delete state.stage
    state.handoffPhase = 'CANONICAL_SUBMISSION'
    state.recoveryEligible = false
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: { failureJson: JSON.stringify(state) },
    })
    expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: { leaseExpiresAt: new Date(0) },
    })
    expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toEqual(recovery)
    const current = await getQualityJourney(f.scope, f.client)
    expect(
      await recoverAppManagedAnalysisRetained(
        { ...f.scope, expectedStateHash: current.journey.stateHash, ...recovery! },
        f.client,
      ),
    ).toMatchObject({ accepted: true, nativeSend: false })
    expect(sender.run).toHaveBeenCalledOnce()
  }, 30_000)

  it('preserves a deterministically rejected charter without offering resubmission of the known invalid proposal', async () => {
    const f = await ready()
    sender.run.mockImplementation((prompt: string) => {
      const candidate = JSON.parse(output(prompt))
      candidate.arguments.charter.cycleId = 'outside-assignment'
      return JSON.stringify(candidate)
    })
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS', workItem: f.scope },
    })
    const failure = JSON.parse(attempt.failureJson!)
    const current = await getQualityJourney(f.scope, f.client)
    await expect(
      recoverAppManagedAnalysisRetained(
        {
          ...f.scope,
          expectedStateHash: current.journey.stateHash,
          attemptId: attempt.id,
          candidateHash: failure.candidateHash,
        },
        f.client,
      ),
    ).rejects.toThrow('unused retained')
    const after = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(after.failureJson).toBe(attempt.failureJson)
    expect(failure).toMatchObject({
      rejection: { kind: 'CANONICAL', code: 'CONFLICT' },
      candidate: { arguments: { charter: { cycleId: 'outside-assignment' } } },
    })
    expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
    expect(await f.client.qualityJourneyAnalysisRevision.count({ where: f.scope })).toBe(0)
    expect(sender.run).toHaveBeenCalledOnce()
  }, 30_000)
  it('retains a live proposal without reporting failure or permitting recovery during its original handoff', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.holdSubmission = true
    const pending = startAppManagedAnalysis(f.input, f.client)
    try {
      await vi.waitFor(() => expect(sender.submissionBlocked).toBe(true))
      const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
        where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS', workItem: f.scope },
      })
      const state = JSON.parse(attempt.failureJson!)
      expect(state).toMatchObject({
        handoffPhase: 'CANONICAL_SUBMISSION',
        senderCleanupVerified: true,
        recoveryEligible: false,
      })
      expect(state).not.toHaveProperty('stage')
      expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
      await expect(
        recoverAppManagedAnalysisRetained(
          { ...f.input, attemptId: attempt.id, candidateHash: state.candidateHash },
          f.client,
        ),
      ).rejects.toThrow('unused retained')
    } finally {
      sender.releaseSubmission?.()
    }
    await expect(pending).resolves.toMatchObject({ awaitingAnswers: false })
    expect(sender.run).toHaveBeenCalledOnce()
  }, 30_000)
  it.each(['BEFORE', 'AFTER'] as const)(
    'recovers retained Analysis after %s canonical acceptance without another native request',
    async mode => {
      const f = await ready()
      sender.run.mockImplementation(output)
      sender.handoffFault = mode
      await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
      const recovery = await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)
      expect(recovery).not.toBeNull()
      const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
      const failure = JSON.parse(attempt.failureJson!)
      const beforeRecovery = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      expect(beforeRecovery.stage).toBe('ANALYSIS')
      if (mode === 'AFTER') {
        expect(attempt.status).toBe('COMPLETED')
        expect(JSON.parse(beforeRecovery.activeWorkItemIdsJson)).not.toContain(attempt.workItemId)
      } else {
        expect(attempt.status).toBe('IN_PROGRESS')
        expect(JSON.parse(beforeRecovery.activeWorkItemIdsJson)).toContain(attempt.workItemId)
      }
      expect(failure).toMatchObject({
        senderCleanupVerified: true,
        nativeSendStarted: true,
        recoveryEligible: true,
        candidate: { toolName: 'quality_journey_analysis_submit' },
      })
      if (mode === 'BEFORE')
        expect(failure.rejection).toEqual({
          kind: 'CANONICAL',
          code: 'INTERNAL',
          message: 'Exact canonical submission interrupted. [url]',
        })
      expect(attempt.failureJson).not.toContain('private transport narrative')
      const current = await getQualityJourney(f.scope, f.client)
      const request = {
        ...f.scope,
        expectedStateHash: current.journey.stateHash,
        attemptId: recovery!.attemptId,
        candidateHash: recovery!.candidateHash,
      }
      await expect(
        recoverAppManagedAnalysisRetained({ ...request, candidateHash: `sha256:${'0'.repeat(64)}` }, f.client),
      ).rejects.toThrow('unused retained')
      const outcomes = await Promise.allSettled([
        recoverAppManagedAnalysisRetained(request, f.client),
        recoverAppManagedAnalysisRetained(request, f.client),
      ])
      expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
      expect(outcomes.find(outcome => outcome.status === 'fulfilled')).toMatchObject({
        value: { accepted: true, nativeSend: false, analysisRevisionId: 'real-analysis-revision' },
      })
      expect(sender.run).toHaveBeenCalledOnce()
      expect(await f.client.qualityJourneyAnalysisRevision.count({ where: f.scope })).toBe(1)
      expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('ANALYSIS_REVIEW')
      const resolved = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
        where: { id: recovery!.attemptId },
      })
      expect(resolved.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_ANALYSIS')
      expect(resolved.dispatchStartedAt).toBeNull()
      expect(JSON.parse(resolved.failureJson!)).toMatchObject({
        candidateHash: recovery!.candidateHash,
        canonicalRecoveryUsed: true,
        canonicalRecoveryOutcome: 'ACCEPTED',
      })
      expect(await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)).toBeNull()
      await expect(recoverAppManagedAnalysisRetained(request, f.client)).rejects.toThrow()
    },
    30_000,
  )

  it('reconciles an already published exact revision after its original publication response is lost', async () => {
    const f = await ready()
    sender.run.mockImplementation(output)
    sender.publicationFault = true
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    expect(await f.client.qualityJourneyAnalysisPublication.count()).toBe(1)
    const recovery = await getAppManagedAnalysisRetainedRecovery(f.scope, f.client)
    const current = await getQualityJourney(f.scope, f.client)
    const published = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    expect(published.stage).toBe('ANALYSIS_REVIEW')
    expect(attempt.status).toBe('COMPLETED')
    expect(JSON.parse(published.activeWorkItemIdsJson)).not.toContain(attempt.workItemId)
    expect(
      await recoverAppManagedAnalysisRetained(
        {
          ...f.scope,
          expectedStateHash: current.journey.stateHash,
          attemptId: recovery!.attemptId,
          candidateHash: recovery!.candidateHash,
        },
        f.client,
      ),
    ).toMatchObject({ accepted: true, nativeSend: false })
    expect(await f.client.qualityJourneyAnalysisPublication.count()).toBe(1)
    expect(sender.run).toHaveBeenCalledOnce()
  }, 30_000)
  it('uses the immutable brief and real schema, accepts through the scoped gateway and publishes the normal review gate', async () => {
    const f = await ready()
    sender.run.mockImplementation(async (prompt: string) => output(prompt))
    await expect(startAppManagedAnalysis(f.input, f.client)).resolves.toEqual({
      analysisRevisionId: 'real-analysis-revision',
      awaitingAnswers: false,
    })
    expect(sender.run).toHaveBeenCalledTimes(1)
    const prompt = sender.run.mock.calls[0]![0] as string
    expect(prompt).toContain('A shopper can pay for an order.')
    expect(prompt).toContain('Return exactly one JSON object')
    expect(prompt).toContain('acceptanceSignals')
    expect(prompt).not.toContain('assignmentSecret')
    const current = await getQualityJourney(f.scope, f.client)
    expect(current.journey.stage).toBe('ANALYSIS_REVIEW')
    expect(await f.client.qualityJourneyAnalysisPublication.count({ where: { journeyId: f.scope.journeyId } })).toBe(1)
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
  })

  it('includes bounded read-only page labels in the model prompt without form values or scripts', async () => {
    const f = await ready()
    await f.client.environment.create({
      data: {
        id: 'analysis-page-env',
        name: 'Checkout',
        baseUrl: 'http://127.0.0.1:44081',
        targetProjectId: f.scope.targetProjectId,
      },
    })
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          '<h1>Card checkout</h1><label>Currency</label><input value="private-value"><script>private-script</script>',
          { headers: { 'Content-Type': 'text/html' } },
        ),
      )
    sender.run.mockImplementation(async (prompt: string) => output(prompt))
    await startAppManagedAnalysis(f.input, f.client)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: 'GET', redirect: 'manual', credentials: 'omit' }),
    )
    const prompt = sender.run.mock.calls[0]![0] as string
    expect(prompt).toContain('PRE-ANALYSIS PAGE EVIDENCE')
    expect(prompt).toContain('Card checkout')
    expect(prompt).toContain('Currency')
    expect(prompt).not.toContain('private-value')
    expect(prompt).not.toContain('private-script')
  })

  it('retains unanswered required questions without bypassing the publication prerequisite', async () => {
    const f = await ready()
    sender.run.mockImplementation(async (prompt: string) => output(prompt, true))
    await expect(startAppManagedAnalysis(f.input, f.client)).resolves.toMatchObject({ awaitingAnswers: true })
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('ANALYSIS')
    expect(await f.client.qualityJourneyAnalysisPublication.count({ where: { journeyId: f.scope.journeyId } })).toBe(0)
    await answerQualityJourneyAnalysisQuestion(
      {
        idempotencyKey: 'answer-currency',
        answer: {
          schemaVersion: 'appraise.quality-journey/v1',
          ...f.scope,
          analysisRevisionId: 'real-analysis-revision',
          questionId: 'QUESTION-CURRENCY',
          answerId: 'currency-answer',
          answer: 'USD only.',
          actor: 'USER',
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('ANALYSIS')
    expect(await f.client.qualityJourneyAnalysisPublication.count({ where: { journeyId: f.scope.journeyId } })).toBe(0)
    expect(sender.run).toHaveBeenCalledTimes(1)
  })

  it('dispatches a new exact successor from saved answers and preserves no-replay boundaries', async () => {
    const f = await ready()
    sender.run.mockImplementation(async (prompt: string) => output(prompt, sender.run.mock.calls.length === 1))
    await startAppManagedAnalysis(f.input, f.client)
    await answerQualityJourneyAnalysisQuestion(
      {
        idempotencyKey: 'answer-for-successor',
        answer: {
          schemaVersion: 'appraise.quality-journey/v1',
          ...f.scope,
          analysisRevisionId: 'real-analysis-revision',
          questionId: 'QUESTION-CURRENCY',
          answerId: 'successor-answer',
          answer: 'USD only.',
          actor: 'USER',
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    const current = await getQualityJourney(f.scope, f.client)
    const input = { ...f.scope, expectedStateHash: current.journey.stateHash }
    await expect(startAppManagedAnalysis(input, f.client)).resolves.toEqual({
      analysisRevisionId: 'real-analysis-revision-2',
      awaitingAnswers: false,
    })
    expect(sender.run).toHaveBeenCalledTimes(2)
    const prompt = sender.run.mock.calls[1]![0] as string
    expect(prompt).toContain('REQUIREMENT_ANALYSIS_REVISION')
    expect(prompt).toContain('USD only.')
    expect(prompt).toContain('successor-answer')
    const revisions = await f.client.qualityJourneyAnalysisRevision.findMany({
      where: { journeyId: f.scope.journeyId },
      orderBy: { revision: 'asc' },
    })
    expect(revisions).toHaveLength(2)
    expect(revisions[1].predecessorRevisionId).toBe(revisions[0].id)
    expect(await f.client.qualityJourneyAnalysisAnswer.count({ where: { journeyId: f.scope.journeyId } })).toBe(1)
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('ANALYSIS_REVIEW')
    await expect(startAppManagedAnalysis(input, f.client)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(2)
  })

  it.each([false, true])(
    'enforces immediate answer lineage across three actual managed Q&A rounds (include historical IDs: %s)',
    async includeHistoricalIds => {
      const f = await ready()
      const submit = vi.spyOn(analysisService, 'submitExternalQualityJourneyAnalysisSuccessor')
      const prompts: Array<{
        answerResolution: unknown
        followup: { predecessor: { data: { resolvedQuestionAnswerIds: string[] } } }
      }> = []
      sender.run.mockImplementation(async (prompt: string) => {
        const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
        prompts.push(context)
        const call = JSON.parse(output(prompt, prompts.length < 3))
        if (prompts.length === 2)
          call.arguments.charter.questions = [
            {
              questionId: 'QUESTION-CONFIRMATION',
              prompt: 'Must confirmation include an order identifier?',
              rationale: 'The terminal success signal depends on it.',
              required: true,
            },
          ]
        if (prompts.length === 3) {
          call.arguments.charter.charterId = 'real-analysis-charter-3'
          call.arguments.charter.analysisRevisionId = 'real-analysis-revision-3'
          call.arguments.charter.constraints = [
            'Cards only.',
            'USD only.',
            'Confirmation includes an order identifier.',
          ]
          call.arguments.charter.resolvedQuestionAnswerIds = includeHistoricalIds
            ? ['round-one-answer', 'round-two-answer']
            : ['round-two-answer']
        }
        return JSON.stringify(call)
      })
      await startAppManagedAnalysis(f.input, f.client)
      async function answer(revision: string, questionId: string, answerId: string, text: string) {
        await answerQualityJourneyAnalysisQuestion(
          {
            idempotencyKey: `record-${answerId}`,
            answer: {
              schemaVersion: 'appraise.quality-journey/v1',
              ...f.scope,
              analysisRevisionId: revision,
              questionId,
              answerId,
              answer: text,
              actor: 'USER',
            },
          },
          f.client,
          trustedHumanCoordinatorSession,
        )
      }
      async function next() {
        const current = await getQualityJourney(f.scope, f.client)
        return startAppManagedAnalysis({ ...f.scope, expectedStateHash: current.journey.stateHash }, f.client)
      }
      await answer('real-analysis-revision', 'QUESTION-CURRENCY', 'round-one-answer', 'USD only.')
      await expect(next()).resolves.toMatchObject({
        analysisRevisionId: 'real-analysis-revision-2',
        awaitingAnswers: true,
      })
      await answer(
        'real-analysis-revision-2',
        'QUESTION-CONFIRMATION',
        'round-two-answer',
        'Require the order identifier.',
      )
      if (includeHistoricalIds) {
        await expect(next()).rejects.toThrow('UNKNOWN')
        await expect(submit.mock.results.at(-1)!.value).rejects.toThrow('outside its immediate predecessor')
        expect(await f.client.qualityJourneyAnalysisRevision.count({ where: { journeyId: f.scope.journeyId } })).toBe(2)
      } else {
        await expect(next()).resolves.toEqual({
          analysisRevisionId: 'real-analysis-revision-3',
          awaitingAnswers: false,
        })
        const revisions = await getQualityJourneyAnalysis(f.scope, f.client)
        const last = JSON.parse(revisions.revisions[2].artifact.artifactJson)
        expect(last.resolvedQuestionAnswerIds).toEqual(['round-two-answer'])
        expect(last.constraints).toContain('USD only.')
        expect(revisions.revisions[2].predecessorRevisionId).toBe(revisions.revisions[1].id)
        expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('ANALYSIS_REVIEW')
      }
      expect(prompts[2].answerResolution).toEqual({
        allowedResolvedQuestionAnswerIds: ['round-two-answer'],
        inheritedAnswerIdsNotEligibleForResolution: ['round-one-answer'],
      })
      expect(prompts[2].followup.predecessor.data.resolvedQuestionAnswerIds).toEqual(['round-one-answer'])
      expect(sender.run).toHaveBeenCalledTimes(3)
    },
  )

  it('includes exact localized revision feedback in the next managed task', async () => {
    const f = await ready()
    sender.run.mockImplementation(async (prompt: string) => output(prompt))
    await startAppManagedAnalysis(f.input, f.client)
    const current = await getQualityJourney(f.scope, f.client)
    const revision = await f.client.qualityJourneyAnalysisRevision.findFirstOrThrow({
      where: { journeyId: f.scope.journeyId },
    })
    const publication = await f.client.qualityJourneyAnalysisPublication.findUniqueOrThrow({
      where: { analysisRevisionId: revision.id },
    })
    const feedback = formatAnalysisFeedback(
      { requirements: [], obligations: [{ obligationId: 'OBL-PAYMENT', statement: 'Card payment creates an order.' }] },
      '',
      { 'obligation:OBL-PAYMENT': 'Show a receipt number.' },
    )
    await requestQualityJourneyAnalysisRevision(
      {
        expectedReviewHash: publication.reviewHash,
        command: {
          schemaVersion: 'appraise.quality-journey/v1',
          ...f.scope,
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          commandId: 'localized-feedback',
          idempotencyKey: 'localized-feedback',
          expectedStateHash: current.journey.stateHash,
          inputArtifactRefs: [
            {
              kind: 'ANALYSIS_CHARTER_REVISION',
              artifactId: revision.artifactId,
              revisionId: revision.artifactRevisionId,
              contentHash: revision.contentHash,
            },
          ],
          payload: {
            reviewedRevisionId: revision.artifactRevisionId,
            reviewedHash: revision.contentHash,
            feedback,
          },
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    const requested = await getQualityJourney(f.scope, f.client)
    await expect(
      startAppManagedAnalysis({ ...f.scope, expectedStateHash: requested.journey.stateHash }, f.client),
    ).resolves.toMatchObject({ analysisRevisionId: 'real-analysis-revision-2' })
    expect(sender.run.mock.calls[1]![0]).toContain('Show a receipt number.')
    const durable = await getQualityJourneyAnalysis(f.scope, f.connect())
    expect(toAnalysisRevisionView(durable.revisions[0]).criteriaFeedback).toEqual({
      'obligation:OBL-PAYMENT': 'Show a receipt number.',
    })
    expect(await f.client.qualityJourneyAnalysisRevision.count({ where: { journeyId: f.scope.journeyId } })).toBe(2)
  })

  it('durably consumes failed native sends and blocks replay after reopening the same database', async () => {
    const f = await ready()
    sender.run.mockRejectedValue(new Error('native UNKNOWN'))
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.scope.journeyId } },
    })
    expect(attempt.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_ANALYSIS')
    expect(attempt.dispatchStartedAt).not.toBeNull()
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({ state: 'UNKNOWN' })
    const reopened = f.connect()
    await expect(startAppManagedAnalysis(f.input, reopened)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
    expect(await reopened.qualityJourneyAnalysisRevision.count({ where: { journeyId: f.scope.journeyId } })).toBe(0)
  })

  it('rejects invented output and concurrent requests without a second native send', async () => {
    const f = await ready()
    let release!: (value: string) => void
    sender.run.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          release = resolve
        }),
    )
    const first = startAppManagedAnalysis(f.input, f.client)
    await vi.waitFor(() => expect(sender.run).toHaveBeenCalledTimes(1))
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow()
    release('{"toolName":"quality_journey_approve","arguments":{}}')
    await expect(first).rejects.toThrow('UNKNOWN')
    expect(sender.run).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyAnalysisRevision.count({ where: { journeyId: f.scope.journeyId } })).toBe(0)
  })

  it('checks server owner enablement and target scope before consuming work', async () => {
    const f = await ready()
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'false')
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('server owner')
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    await expect(
      startAppManagedAnalysis({ ...f.input, targetProjectId: 'another-project' }, f.client),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(sender.run).not.toHaveBeenCalled()
    expect(
      await f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.scope.journeyId } } }),
    ).toBe(0)
  })

  it('blocks another Journey while the original native dispatch remains unresolved', async () => {
    const f = await ready()
    const other = await ready(f, 'other-analysis')
    sender.run.mockRejectedValue(new Error('native UNKNOWN'))
    await expect(startAppManagedAnalysis(f.input, f.client)).rejects.toThrow('UNKNOWN')
    await expect(startAppManagedAnalysis(other.input, other.client)).rejects.toThrow('reconciliation')
    expect(sender.run).toHaveBeenCalledTimes(1)
    expect(
      await f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: other.scope.journeyId } } }),
    ).toBe(0)
  })

  it('retains the original private caller credential across a database reconnect and separates session scope', async () => {
    const f = await ready()
    const scope = {
      journeyId: f.scope.journeyId,
      targetProjectId: f.scope.targetProjectId,
      coordinatorSessionId: 'session-original',
      coordinatorGeneration: 1,
    }
    const original = await appManagedAnalysisCredential(scope, f.client)
    expect(await appManagedAnalysisCredential(scope, f.connect())).toBe(original)
    expect(await appManagedAnalysisCredential({ ...scope, coordinatorGeneration: 2 }, f.client)).not.toBe(original)
  })
})
