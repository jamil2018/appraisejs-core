import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { prepareM10AutomationFixture, type M10OfflineDispatchEvent } from '../../../../src/test/m10-journey-fixture'
import { createQualityJourneyDiscoveryBrowserRuntime } from '../../../../src/services/coordinator/quality-journey-discovery-browser-runtime'
import { trustedHumanCoordinatorSession } from '../../../../src/services/coordinator/quality-journey-coordinator-session'
import { answerQualityJourneyAnalysisQuestion } from '../../../../src/services/coordinator/quality-journey-analysis-service'
import {
  observeQualityJourneyAnalysisFollowupInTransaction,
  claimExternalQualityJourneyAnalysisFollowup,
  admitExternalQualityJourneyWork,
} from '../../../../src/services/coordinator/quality-journey-service'

export const scriptedDisposableHuman = 'SCRIPTED_DISPOSABLE_TEST_HUMAN' as const
export type NativeLineageEvent = Readonly<{
  kind:
    | 'ANALYSIS_INITIAL'
    | 'ANALYSIS_FOLLOWUP'
    | 'SCOUT'
    | 'RESOURCE_EXPLORER'
    | 'TEST_SCENARIO_DESIGNER'
    | 'AUTOMATOR'
    | 'TRIAGER'
  original: M10OfflineDispatchEvent
  arguments: Record<string, unknown>
}>
type NativeDiscoveryBoundary = Parameters<
  NonNullable<NonNullable<Parameters<typeof prepareM10AutomationFixture>[1]>['beforeDiscoveryBrowser']>
>[0]
type FixtureOwned = Readonly<{ client: PrismaClient; workspace: string; databasePath: string }>
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
function analysisResult(value: unknown) {
  if (
    !object(value) ||
    !object(value.analysisRevision) ||
    typeof value.analysisRevision.id !== 'string' ||
    typeof value.analysisRevision.contentHash !== 'string'
  )
    throw new Error('Exact canonical Analysis result required')
  return value as { analysisRevision: { id: string; contentHash: string } }
}
export function nativeProducerArguments(event: M10OfflineDispatchEvent) {
  const args = structuredClone(event.arguments)
  if (event.binding.role === 'REQUIREMENT_ANALYZER') {
    if (!object(args.charter)) throw new Error('Exact Analysis charter required')
    for (const key of ['schemaVersion', 'journeyId', 'targetProjectId']) delete args.charter[key]
  }
  return args
}

/** Owns one disposable canonical Journey. Every future browser/role boundary waits for its original caller. */
export function createNativeJourneyLineage(baseUrl?: string, workspaceParent?: string) {
  let fixture: FixtureOwned | undefined
  let fixtureFlight: ReturnType<typeof prepareM10AutomationFixture> | undefined
  let terminalFixture: Awaited<ReturnType<typeof prepareM10AutomationFixture>> | undefined
  let next = deferred<NativeLineageEvent>()
  let originalSubmission: ReturnType<typeof deferred<unknown>> | undefined
  let initial: NativeLineageEvent | undefined
  let acceptedInitial: ReturnType<typeof analysisResult> | undefined
  let acceptedFollowup: ReturnType<typeof analysisResult> | undefined
  let current: NativeLineageEvent | undefined
  let acceptedCurrent: unknown
  const browser = deferred<NativeDiscoveryBoundary>()
  const browserRelease = deferred<void>()
  let stopped = false,
    followupClaimed = false,
    browserEntered = false
  let failure: string | null = null
  const questionId = 'm13-analysis-scope-question'
  const answerText = 'Only checkout navigation is in scope; payment submission is excluded.'
  const answerId = `m13-scripted-answer-${randomUUID()}`

  function assertActive() {
    if (stopped) throw new Error('Original native lineage stopped; evidence retained')
  }
  function publish(event: NativeLineageEvent) {
    assertActive()
    current = event
    next.resolve(event)
  }
  async function dispatch(event: M10OfflineDispatchEvent) {
    if (stopped) throw new Error('Original native lineage stopped')
    const args = nativeProducerArguments(event)
    const kind = event.binding.role === 'REQUIREMENT_ANALYZER' ? 'ANALYSIS_INITIAL' : event.binding.role
    if (kind === 'TRIAGER') throw new Error('Real execution and Triager preparation are separately required')
    originalSubmission = deferred<unknown>()
    if (kind === 'ANALYSIS_INITIAL') {
      const charter = args.charter as Record<string, unknown>
      charter.questions = [
        {
          questionId,
          prompt: 'Which checkout behavior is in scope?',
          required: true,
          rationale: 'Resolve payment submission scope before downstream design.',
        },
      ]
      initial = Object.freeze({ kind, original: event, arguments: args })
      publish(initial)
    } else publish(Object.freeze({ kind, original: event, arguments: args }))
    return originalSubmission.promise
  }
  function start() {
    if (fixtureFlight) return
    fixtureFlight = prepareM10AutomationFixture(baseUrl, {
      dispatch,
      qualificationLeaseSeconds: 900,
      workspaceParent,
      onFixtureOwned(owned) {
        fixture = owned
      },
      preserveOnFailure: true,
      serialDiscoveryAdmissions: true,
      requireObservedDiscoveryCleanup: true,
      discoveryRuntime: createQualityJourneyDiscoveryBrowserRuntime({ headless: true }),
      async beforeDiscoveryBrowser(boundary) {
        assertActive()
        browserEntered = true
        browser.resolve(boundary)
        await browserRelease.promise
        if (stopped) throw new Error('Original native lineage stopped')
      },
    })
    void fixtureFlight.then(
      value => {
        terminalFixture = value
      },
      () => {
        failure = 'CANONICAL_FIXTURE_STOPPED_UNKNOWN'
        next.reject(new Error(failure))
        browser.reject(new Error(failure))
      },
    )
  }
  return Object.freeze({
    async prepareInitial() {
      assertActive()
      start()
      const event = await next.promise
      assertActive()
      if (event.kind !== 'ANALYSIS_INITIAL') throw new Error('Initial Analysis boundary required')
      return event
    },
    acceptCurrentCanonicalResult(value: unknown) {
      assertActive()
      if (!current || acceptedCurrent !== undefined) throw new Error('One original canonical acceptance required')
      if (current.kind === 'ANALYSIS_INITIAL') acceptedInitial = analysisResult(value)
      if (current.kind === 'ANALYSIS_FOLLOWUP') acceptedFollowup = analysisResult(value)
      acceptedCurrent = value
    },
    async prepareAnalysisFollowup(persona: typeof scriptedDisposableHuman) {
      assertActive()
      if (persona !== scriptedDisposableHuman || !initial || !acceptedInitial || followupClaimed || !fixture)
        throw new Error('Exact scripted disposable Analysis answer boundary required')
      followupClaimed = true
      const original = initial.original,
        binding = original.binding,
        client = fixture.client
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: answerId,
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId,
            journeyId: binding.journeyId,
            targetProjectId: binding.targetProjectId,
            analysisRevisionId: acceptedInitial.analysisRevision.id,
            questionId,
            answer: answerText,
            actor: 'USER',
          },
        },
        client,
        trustedHumanCoordinatorSession,
      )
      assertActive()
      const issuance = await client.$transaction(tx => observeQualityJourneyAnalysisFollowupInTransaction(binding, tx))
      assertActive()
      if (!issuance.expected) throw new Error('Exact answer-bound follow-up issuance required')
      const assignmentSecret = `m13-original-followup-${randomUUID()}-${randomUUID()}`
      const claim = await claimExternalQualityJourneyAnalysisFollowup(
        {
          journeyId: binding.journeyId,
          targetProjectId: binding.targetProjectId,
          coordinatorSessionId: binding.coordinatorSessionId,
          coordinatorGeneration: binding.coordinatorGeneration,
          coordinatorPrincipalId: binding.coordinatorPrincipalId,
          principal: binding.principal,
          role: 'REQUIREMENT_ANALYZER',
          leaseSeconds: 900,
          assignmentSecret,
          idempotencyKey: `m13-followup-claim-${answerId}`,
          expected: issuance.expected,
        },
        client,
      )
      assertActive()
      const followup = {
        ...binding,
        assignmentSecret,
        workItemId: claim.workItem.id,
        attemptId: claim.attempt.id,
        assignmentId: claim.assignment.assignmentId,
        assignmentGeneration: claim.assignmentGeneration,
        leaseId: claim.attempt.leaseId,
      }
      await admitExternalQualityJourneyWork({ ...followup, idempotencyKey: `m13-followup-admit-${answerId}` }, client)
      assertActive()
      const charter = structuredClone(initial.arguments.charter as Record<string, unknown>)
      charter.analysisRevisionId = `m13-analysis-followup-${randomUUID()}`
      charter.questions = []
      charter.resolvedQuestionAnswerIds = [answerId]
      charter.scope = { included: ['Checkout'], excluded: ['Payment submission'] }
      const args = {
        idempotencyKey: `m13-followup-submit-${answerId}`,
        predecessorAnalysisRevisionId: acceptedInitial.analysisRevision.id,
        charter,
      }
      current = Object.freeze({
        kind: 'ANALYSIS_FOLLOWUP',
        original: { ...original, binding: followup },
        arguments: args,
      })
      acceptedCurrent = undefined
      return current
    },
    async prepareDiscoveryBoundary(persona: typeof scriptedDisposableHuman) {
      assertActive()
      if (persona !== scriptedDisposableHuman || !acceptedFollowup || current?.kind !== 'ANALYSIS_FOLLOWUP')
        throw new Error('Reconciled two-turn Analysis and explicit scripted persona required')
      originalSubmission!.resolve(acceptedFollowup)
      return browser.promise
    },
    async releaseVerifiedDiscoveryBoundary() {
      if (!browserEntered || !acceptedFollowup || stopped)
        throw new Error('Original prepared discovery boundary required')
      next = deferred<NativeLineageEvent>()
      acceptedCurrent = undefined
      browserRelease.resolve()
      return next.promise
    },
    async prepareNextRole() {
      assertActive()
      if (!current || current.kind.startsWith('ANALYSIS') || acceptedCurrent === undefined || !originalSubmission)
        throw new Error('Original reconciled role acceptance required')
      next = deferred<NativeLineageEvent>()
      const prior = current.kind,
        result = acceptedCurrent
      acceptedCurrent = undefined
      current = undefined
      originalSubmission.resolve(result)
      if (prior === 'AUTOMATOR') {
        await fixtureFlight
        assertActive()
        if (!terminalFixture) throw new Error('Canonical automation preparation incomplete')
        return Object.freeze({
          kind: 'REAL_EXECUTION_REQUIRED' as const,
          journeyId: terminalFixture.scope.journeyId,
          targetProjectId: terminalFixture.scope.targetProjectId,
          preparedCapsuleIds: terminalFixture.prepared.map(value => value.id),
          consent: 'REQUIRES_EXPLICIT_SCRIPTED_DISPOSABLE_HUMAN_CONSENT' as const,
          runtimeQualified: false as const,
        })
      }
      return next.promise
    },
    executionFixture() {
      if (!terminalFixture || stopped) throw new Error('Original completed automation fixture required')
      return terminalFixture
    },
    recordOriginalTriager(event: NativeLineageEvent) {
      if (!terminalFixture || current || event.kind !== 'TRIAGER' || stopped)
        throw new Error('One original prepared Triager required')
      current = event
      acceptedCurrent = undefined
    },
    fixtureOwned() {
      if (!fixture) throw new Error('Original disposable fixture unavailable')
      return fixture
    },
    snapshot: () =>
      Object.freeze({
        failure,
        stopped,
        currentKind: current?.kind ?? null,
        browserEntered,
        persona: scriptedDisposableHuman,
        humanWaitMetric: 'UNQUALIFIED' as const,
        realHumanInteractionObserved: false as const,
      }),
    async stopAndRetain() {
      stopped = true
      const reason = new Error('Original native lineage stopped; evidence retained')
      originalSubmission?.reject(reason)
      browserRelease.reject(reason)
      next.reject(reason)
      if (fixtureFlight) await fixtureFlight.catch(() => {})
      if (fixture) await fixture.client.$disconnect()
      return Object.freeze({ databaseRetained: true as const, originalClientDisconnected: !!fixture })
    },
  })
}
