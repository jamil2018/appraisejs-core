import { normalizeDiscoveryAuthTransitPolicyJson } from '@/lib/quality-journey/discovery-auth-transit-policy'
import {
  captureAppManagedAnonymousDiscovery,
  readAppManagedAnonymousDiscoveryCapture,
} from './app-managed-discovery-capture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  createAppManagedJourney,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import { startAppManagedAnalysis } from './app-managed-analysis-service'
import { startAppManagedDiscovery } from './app-managed-discovery-service'
import {
  requestAppManagedScoutCorrection,
  requestAppManagedExplorerCorrection,
  createAppManagedDiscoveryCorrection,
} from './app-managed-discovery-correction'
import { decideQualityJourneyAnalysis } from './quality-journey-analysis-service'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'
const sender = vi.hoisted(() => ({ run: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/quality-journey/codex-app-server/managed-analysis-sender', () => ({
  runManagedAnalysis: sender.run,
  verifyManagedAnalysisExecutable: sender.verify,
  classifyManagedAnalysisFailure: () => 'Native send UNKNOWN',
}))
const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
beforeEach(() => {
  vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
  vi.stubEnv('APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED', 'true')
  sender.run.mockReset()
  sender.verify.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => {
  vi.unstubAllEnvs()
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
      charter: {
        charterId: 'real-analysis-charter',
        analysisRevisionId: 'real-analysis-revision',
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
        resolvedQuestionAnswerIds: [],
      },
    },
  })
}

async function discoveryReady(authPolicy: string | null = null) {
  const f = await ready()
  await f.client.environment.create({
    data: {
      id: 'discovery-env',
      name: 'Disposable',
      baseUrl: 'http://127.0.0.1:44081',
      discoveryAuthTransitPolicyJson: normalizeDiscoveryAuthTransitPolicyJson(authPolicy, 'http://127.0.0.1:44081'),
      targetProjectId: f.scope.targetProjectId,
    },
  })
  await f.client.module.create({
    data: { id: 'discovery-module', name: 'Checkout', targetProjectId: f.scope.targetProjectId },
  })
  await f.client.locatorGroup.create({
    data: {
      id: 'discovery-locators',
      name: 'Checkout',
      route: '/checkout',
      moduleId: 'discovery-module',
      targetProjectId: f.scope.targetProjectId,
    },
  })
  sender.run.mockImplementation(async (prompt: string) => output(prompt))
  await startAppManagedAnalysis(f.input, f.client)
  const analysis = await f.client.qualityJourneyAnalysisRevision.findFirstOrThrow({
    where: { journeyId: f.scope.journeyId },
  })
  await decideQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...f.scope,
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      commandId: 'approve-analysis',
      idempotencyKey: 'approve-analysis',
      expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash,
      inputArtifactRefs: [
        {
          kind: 'ANALYSIS_CHARTER_REVISION',
          artifactId: analysis.artifactId,
          revisionId: analysis.artifactRevisionId,
          contentHash: analysis.contentHash,
        },
      ],
      payload: { revisionId: analysis.id, contentHash: analysis.contentHash, decision: 'APPROVED' },
    },
    f.client,
    trustedHumanCoordinatorSession,
  )
  sender.run.mockReset()
  const discovery = await f.client.qualityJourneyDiscoveryRevision.findFirstOrThrow({
    where: { journeyId: f.scope.journeyId },
  })
  return {
    ...f,
    discovery,
    input: { ...f.scope, expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash },
  }
}
function discoveryOutput(prompt: string) {
  const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
  if (context.role === 'SCOUT') return JSON.stringify({ factIndexes: [0] })
  const destinationResourceIndex = context.resources.findIndex(
    (resource: { id: string }) => resource.id === 'module:discovery-module',
  )
  return JSON.stringify({
    destinationResourceIndex,
    classifications: [
      {
        resourceIndex: destinationResourceIndex,
        requirementIndex: 0,
        classification: 'COMPATIBLE',
        rationale: 'Use the frozen checkout module.',
      },
    ],
    missing: [],
  })
}
/** Canonical capture/admission coverage without native browser or provider effects. */
function captureRuntime(passwordInput = false, onLaunch = () => undefined): DiscoveryBrowserRuntime {
  let url = 'about:blank'
  const frame = { url: () => url }
  return {
    async launch() {
      onLaunch()
      return {
        on() {},
        isConnected: () => true,
        async close() {},
        async newContext() {
          return {
            on() {},
            async close() {},
            async route() {},
            async routeWebSocket() {},
            async newPage() {
              return {
                on() {},
                isClosed: () => false,
                async close() {},
                url: frame.url,
                title: async () => 'Private title must never enter the worker prompt',
                captureControlPresence: async () => ({
                  documentIdentity: 'fixture-document',
                  presence: { emailInput: false, passwordInput, submitControl: false, heading: true },
                }),
                assertCaptureDocument: async () => undefined,
                mainFrame: () => frame,
                async goto(next) {
                  url = next
                },
              }
            },
          }
        },
      }
    },
  }
}
async function capture(f: Awaited<ReturnType<typeof discoveryReady>>, snapshotId = 'captured-checkout') {
  const scope = { ...f.scope, discoveryRevisionId: f.discovery.id }
  const session = await startQualityJourneyDiscoveryBrowserSession(
    {
      ...scope,
      workItemId: f.discovery.scoutWorkItemId,
      environmentId: 'discovery-env',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS',
    },
    f.client,
    captureRuntime(),
  )
  try {
    return await captureQualityJourneyDiscoveryBrowserReceipt({ ...scope, sessionId: session.id, snapshotId }, f.client)
  } finally {
    await closeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })
  }
}
describe('app-managed Discovery dispatch', () => {
  it('automatically captures only the exact anonymous scope once and closes its canonical browser before Scout dispatch', async () => {
    const f = await discoveryReady()
    const launch = vi.fn()
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'READY',
    )
    const captured = await captureAppManagedAnonymousDiscovery(f.input, f.client, captureRuntime(false, launch))
    expect(captured.receipt).toMatchObject({
      accessMode: 'ANONYMOUS',
      accessOutcome: 'ACTIVE',
      routeId: '/checkout',
      environmentId: 'discovery-env',
    })
    expect(await f.client.qualityJourneyOwnedBrowser.findMany({ where: { journeyId: f.scope.journeyId } })).toEqual([
      expect.objectContaining({ status: 'STOP_OBSERVED' }),
    ])
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'EVIDENCE_AVAILABLE',
    )
    await expect(
      captureAppManagedAnonymousDiscovery(f.input, f.connect(), captureRuntime(false, launch)),
    ).rejects.toThrow('unavailable')
    expect(launch).toHaveBeenCalledTimes(1)
    sender.run.mockImplementation(async (prompt: string) => discoveryOutput(prompt))
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).resolves.toMatchObject({
      accepted: true,
    })
  })
  it('keeps in-flight automatic inspection distinct from recovery and blocks a concurrent wake', async () => {
    const f = await discoveryReady()
    let release!: () => void
    const waiting = new Promise<void>(resolve => {
      release = resolve
    })
    const base = captureRuntime()
    const launch = vi.fn(async () => {
      await waiting
      return base.launch()
    })
    const first = captureAppManagedAnonymousDiscovery(f.input, f.client, { ...base, launch })
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1))
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'INSPECTING',
    )
    await expect(captureAppManagedAnonymousDiscovery(f.input, f.client, base)).rejects.toThrow('unavailable')
    release()
    await first
    expect(launch).toHaveBeenCalledTimes(1)
  })
  it('keeps a captured receipt parked when automatic browser cleanup is UNKNOWN', async () => {
    const f = await discoveryReady()
    const base = captureRuntime()
    const runtime = {
      ...base,
      async launch() {
        const browser = await base.launch()
        return {
          ...browser,
          async close() {
            throw new Error('unconfirmed close')
          },
        }
      },
    }
    await expect(captureAppManagedAnonymousDiscovery(f.input, f.client, runtime)).rejects.toThrow('cleanup')
    expect(
      await f.client.qualityJourneyArtifact.count({
        where: { journeyId: f.scope.journeyId, kind: 'DISCOVERY_BROWSER_RECEIPT' },
      }),
    ).toBe(1)
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'RECOVERY_REQUIRED',
    )
    await expect(captureAppManagedAnonymousDiscovery(f.input, f.connect(), captureRuntime())).rejects.toThrow(
      'unavailable',
    )
    expect(sender.run).not.toHaveBeenCalled()
  })
  it('requires human access for an explicitly configured sign-in policy before opening an anonymous browser', async () => {
    const policy = JSON.stringify({
      schemaVersion: 'appraise.discovery-auth-transit/v1',
      flows: [
        {
          flowId: 'login',
          rules: [
            {
              documentOrigin: '$TARGET',
              destinationOrigin: 'https://idp.example.test',
              path: { match: 'EXACT', value: '/authorize' },
              methods: ['GET'],
              requestKinds: ['DOCUMENT'],
            },
          ],
          returns: [{ fromOrigin: 'https://idp.example.test', targetPath: '/checkout', methods: ['GET'] }],
        },
      ],
    })
    const f = await discoveryReady(policy)
    const launch = vi.fn()
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'MANUAL_REQUIRED',
    )
    await expect(captureAppManagedAnonymousDiscovery(f.input, f.client, captureRuntime(false, launch))).rejects.toThrow(
      'unavailable',
    )
    expect(launch).not.toHaveBeenCalled()
    expect(sender.run).not.toHaveBeenCalled()
    expect(await f.client.qualityJourneyOwnedBrowser.count({ where: { journeyId: f.scope.journeyId } })).toBe(0)
  })
  it('does not persist anonymous sign-in-screen evidence or automatically replay its closed attempt', async () => {
    const f = await discoveryReady()
    const launch = vi.fn()
    await expect(captureAppManagedAnonymousDiscovery(f.input, f.client, captureRuntime(true, launch))).rejects.toThrow(
      'human inspection or sign-in',
    )
    expect(
      await f.client.qualityJourneyArtifact.count({
        where: { journeyId: f.scope.journeyId, kind: 'DISCOVERY_BROWSER_RECEIPT' },
      }),
    ).toBe(0)
    expect((await f.client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(f.input, tx))).status).toBe(
      'MANUAL_REQUIRED',
    )
    await expect(
      captureAppManagedAnonymousDiscovery(f.input, f.connect(), captureRuntime(false, launch)),
    ).rejects.toThrow('unavailable')
    expect(launch).toHaveBeenCalledTimes(1)
    expect(sender.run).not.toHaveBeenCalled()
  })
  it('injects upstream evidence and contiguous ranks for resource index choices', async () => {
    const f = await discoveryReady()
    sender.run.mockImplementation(async (prompt: string) => {
      const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
      const call = JSON.parse(discoveryOutput(prompt))
      const operationIndex = context.resources.findIndex((resource: { kind: string }) => resource.kind === 'OPERATION')
      call.classifications.unshift({
        resourceIndex: operationIndex,
        requirementIndex: 0,
        classification: 'COMPATIBLE',
        rationale: 'The operation is reusable.',
      })
      call.missing = [{ requirementIndex: 0, rationale: 'Unavailable payment mapping.' }]
      return JSON.stringify(call)
    })
    await startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)
    const revision = await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } })
    const bundle = JSON.parse(revision.resourceResolutionJson!)
    expect(bundle.reusable.map((entry: { rank: number }) => entry.rank)).toEqual([1, 2])
    expect(bundle.reusable.map((entry: { resourceKind: string }) => entry.resourceKind)).toEqual([
      'OPERATION',
      'MODULE',
    ])
    const receipts = bundle.inputArtifacts.map((ref: { artifactId: string }) => ref.artifactId).sort()
    for (const entry of [...bundle.reusable, ...bundle.missing]) expect(entry.evidenceReceiptIds).toEqual(receipts)
  })
  it('waits for canonical browser evidence without consuming a Scout attempt', async () => {
    const f = await discoveryReady()
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).rejects.toThrow(
      'waiting for evidence',
    )
    expect(sender.run).not.toHaveBeenCalled()
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: f.discovery.scoutWorkItemId } })).toBe(
      0,
    )
  })
  it('accepts both exact assignments through canonical gateways while preserving human gates', async () => {
    const f = await discoveryReady()
    const captured = await capture(f)
    sender.run.mockImplementation(async (prompt: string) => discoveryOutput(prompt))
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).resolves.toMatchObject({
      role: 'RESOURCE_EXPLORER',
      accepted: true,
    })
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).resolves.toMatchObject({
      role: 'SCOUT',
      accepted: true,
    })
    expect(sender.run).toHaveBeenCalledTimes(2)
    const prompts = sender.run.mock.calls.map(call => call[0] as string)
    expect(prompts[0]).toContain('module:discovery-module')
    expect(prompts[1]).toContain(captured.receipt.snapshotId)
    for (const prompt of prompts) {
      expect(prompt).not.toContain('assignmentSecret')
      expect(prompt).not.toContain('Private title')
      expect(prompt).not.toContain('discoveryAuthTransitPolicyJson')
    }
    const revision = await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } })
    expect(revision.status).toBe('COMPLETED')
    expect(
      await f.client.qualityJourneyScenarioDecision.count({
        where: { portfolioRevision: { journeyId: f.scope.journeyId } },
      }),
    ).toBe(0)
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(2)
  })
  it('durably retains UNKNOWN and refuses replay after reconnect', async () => {
    const f = await discoveryReady()
    sender.run.mockRejectedValue(new Error('secret provider diagnostic'))
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: f.discovery.resourceWorkItemId },
    })
    expect(attempt.dispatchAdapterId).toBe('APP_SERVER_LOCAL_V1_DISCOVERY_RESOURCE_EXPLORER')
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({ state: 'UNKNOWN' })
    expect(attempt.failureJson).not.toContain('secret provider diagnostic')
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.connect())).rejects.toThrow()
    expect(sender.run).toHaveBeenCalledTimes(1)
  })
  it('rejects credential-bearing output before canonical acceptance', async () => {
    const f = await discoveryReady()
    sender.run.mockResolvedValue(
      '{"toolName":"quality_journey_resource_resolution_submit","arguments":{"assignmentSecret":"injected"}}',
    )
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    expect(
      (await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } }))
        .resourceResolutionHash,
    ).toBeNull()
  })
  it('requires separate server owner enablement and current target scope', async () => {
    const f = await discoveryReady()
    vi.stubEnv('APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED', 'false')
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow(
      'server owner',
    )
    vi.stubEnv('APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED', 'true')
    await expect(
      startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER', targetProjectId: 'other-project' }, f.client),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(sender.run).not.toHaveBeenCalled()
  })

  it('serializes concurrent requests and prevents cross-role dispatch while native work is unresolved', async () => {
    const f = await discoveryReady()
    await capture(f)
    let release!: (value: string) => void
    sender.run.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          release = resolve
        }),
    )
    const first = startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)
    await vi.waitFor(() => expect(sender.run).toHaveBeenCalledTimes(1))
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow()
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).rejects.toThrow('reconciliation')
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: f.discovery.scoutWorkItemId } })).toBe(
      0,
    )
    release(discoveryOutput(sender.run.mock.calls[0]![0]))
    await expect(first).resolves.toMatchObject({ accepted: true })
    expect(sender.run).toHaveBeenCalledTimes(1)
  })
})

describe('proven Explorer rejection correction', () => {
  const pinnedExecutableFailure = {
    canonicalSubmissionStarted: false,
    detail: 'Managed Analysis requires pinned Codex 0.169.1; attempt outcome UNKNOWN',
    reason: 'NATIVE_SEND_DID_NOT_COMPLETE',
    refusalCategory: 'UNCLASSIFIED_REFUSAL',
    senderCleanupVerified: false,
    stage: 'NATIVE_SEND',
    state: 'UNKNOWN',
  }

  it.each(['SCOUT', 'RESOURCE_EXPLORER'] as const)(
    'refuses an incompatible executable before claiming new %s work',
    async role => {
      const f = await discoveryReady()
      const before = await f.client.qualityJourneyWorkAttempt.count()
      sender.verify.mockRejectedValue(new Error('unsupported executable'))
      await expect(startAppManagedDiscovery({ ...f.input, role }, f.client)).rejects.toThrow('unsupported executable')
      expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(before)
      expect(sender.run).not.toHaveBeenCalled()
    },
  )

  async function executableRefused(role: 'SCOUT' | 'RESOURCE_EXPLORER') {
    const f = await discoveryReady()
    await capture(f)
    sender.run.mockRejectedValue(new Error('native UNKNOWN'))
    await expect(startAppManagedDiscovery({ ...f.input, role }, f.client)).rejects.toThrow('UNKNOWN')
    const original = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: role === 'SCOUT' ? f.discovery.scoutWorkItemId : f.discovery.resourceWorkItemId },
    })
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: original.id },
      data: { failureJson: JSON.stringify(pinnedExecutableFailure) },
    })
    return { ...f, original: { ...original, failureJson: JSON.stringify(pinnedExecutableFailure) } }
  }

  it.each(['SCOUT', 'RESOURCE_EXPLORER'] as const)(
    'reconciles exact historical pre-model %s refusal into a distinct bounded Discovery revision',
    async role => {
      const f = await executableRefused(role)
      const request = role === 'SCOUT' ? requestAppManagedScoutCorrection : requestAppManagedExplorerCorrection
      await request(f.input, f.client)
      const original = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.original.id } })
      expect(original).toMatchObject({ status: 'FAILED', failureJson: f.original.failureJson })
      const event = await f.client.qualityJourneyEvent.findFirstOrThrow({
        where: { journeyId: f.scope.journeyId, eventType: `${role}_RECONCILED_WITHOUT_COMMIT` },
      })
      expect(JSON.parse(event.payloadJson)).toMatchObject({
        reconciliationBasis: 'PRE_MODEL_EXECUTABLE_REFUSAL',
        nativeSendStarted: false,
        originalFailure: pinnedExecutableFailure,
      })
      const current = await getQualityJourney(f.scope, f.client)
      const retry = await createAppManagedDiscoveryCorrection(
        { ...f.scope, expectedStateHash: current.journey.stateHash },
        f.client,
      )
      expect(retry.discoveryRevision).toMatchObject({
        predecessorRevisionId: f.discovery.id,
        journeyId: f.scope.journeyId,
        targetObservationHash: null,
        resourceResolutionHash: null,
      })
      expect(retry.discoveryRevision.id).not.toBe(f.discovery.id)
      expect(sender.run).toHaveBeenCalledTimes(1)
    },
  )

  it('refuses nearby native failure shapes without modifying their consumed markers', async () => {
    const f = await executableRefused('SCOUT')
    for (const change of [
      { detail: 'Managed Analysis cleanup unverified; private root retained; attempt outcome UNKNOWN' },
      { detail: 'Managed Analysis timed out; attempt outcome UNKNOWN' },
      { canonicalSubmissionStarted: true },
      { senderCleanupVerified: true },
      { refusalCategory: 'CANONICAL_CONFLICT' },
      { nativeSendStarted: true },
    ]) {
      const failureJson = JSON.stringify({ ...pinnedExecutableFailure, ...change })
      await f.client.qualityJourneyWorkAttempt.update({ where: { id: f.original.id }, data: { failureJson } })
      await expect(requestAppManagedScoutCorrection(f.input, f.client)).rejects.toThrow('uncertain')
      expect(
        await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.original.id } }),
      ).toMatchObject({
        status: 'IN_PROGRESS',
        failureJson,
        dispatchReservedAt: f.original.dispatchReservedAt,
        dispatchStartedAt: f.original.dispatchStartedAt,
      })
    }
    expect(sender.run).toHaveBeenCalledTimes(1)
  })

  it('uses one exact selected snapshot and safely reconciles returned Scout validation failure while preserving accepted resources', async () => {
    const f = await discoveryReady()
    await capture(f, 'older-captured-checkout')
    const latest = await capture(f, 'latest-captured-checkout')
    sender.run.mockImplementation(async (prompt: string) => discoveryOutput(prompt))
    await startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)
    const before = await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } })
    sender.run.mockImplementation(async (prompt: string) => {
      const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
      expect(context.selectedSnapshot.snapshotId).toBe(latest.receipt.snapshotId)
      expect(context).not.toHaveProperty('assignment.evidence')
      return 'invalid JSON after the sender returned'
    })
    await expect(startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)).rejects.toThrow('UNKNOWN')
    const original = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: f.discovery.scoutWorkItemId },
    })
    expect(JSON.parse(original.failureJson!)).toMatchObject({ stage: 'OUTPUT_VALIDATION', senderCleanupVerified: true })
    await requestAppManagedScoutCorrection(f.input, f.client)
    const reconciled = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: original.id } })
    expect(reconciled).toMatchObject({
      status: 'FAILED',
      failureJson: original.failureJson,
      dispatchAdapterId: original.dispatchAdapterId,
      dispatchStartedAt: null,
      dispatchReservedAt: null,
    })
    expect(
      (await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } }))
        .resourceResolutionHash,
    ).toBe(before.resourceResolutionHash)
    const retryInput = { ...f.scope, expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash }
    const fresh = await createAppManagedDiscoveryCorrection(retryInput, f.client)
    expect(fresh.discoveryRevision.id).not.toBe(f.discovery.id)
    expect(sender.run).toHaveBeenCalledTimes(2)
  })
  async function rejectedExplorer() {
    const f = await discoveryReady()
    await capture(f)
    sender.run.mockImplementation(async (prompt: string) => discoveryOutput(prompt))
    await startAppManagedDiscovery({ ...f.input, role: 'SCOUT' }, f.client)
    sender.run.mockImplementation(async (prompt: string) => {
      const candidate = JSON.parse(discoveryOutput(prompt))
      candidate.classifications[0].resourceIndex = 999999
      return JSON.stringify(candidate)
    })
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const original = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: f.discovery.resourceWorkItemId },
    })
    expect(JSON.parse(original.failureJson!)).toMatchObject({
      stage: 'CONTRACT_PREFLIGHT',
      senderCleanupVerified: true,
    })
    return { ...f, original }
  }

  it('reconciles after lease expiry, preserves Scout and failure, then freezes configured setup in a separate canonical retry', async () => {
    const f = await rejectedExplorer()
    const before = await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } })
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.original.id },
      data: { leaseExpiresAt: new Date(0) },
    })
    const correction = await requestAppManagedExplorerCorrection(f.input, f.client)
    expect(correction.replayed).toBe(false)
    expect(correction.workItemId).toBe(f.original.workItemId)
    const original = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.original.id } })
    expect(original).toMatchObject({
      status: 'FAILED',
      failureJson: f.original.failureJson,
      dispatchAdapterId: f.original.dispatchAdapterId,
      dispatchReservedAt: null,
      dispatchStartedAt: null,
    })
    const invalidated = await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({
      where: { id: f.discovery.id },
    })
    expect(invalidated).toMatchObject({
      status: 'INVALIDATED',
      resourceWorkItemId: before.resourceWorkItemId,
      targetObservationHash: before.targetObservationHash,
      targetObservationJson: before.targetObservationJson,
      analysisRevisionId: before.analysisRevisionId,
    })
    expect(await requestAppManagedExplorerCorrection(f.input, f.connect())).toEqual({ ...correction, replayed: true })
    expect(sender.run).toHaveBeenCalledTimes(2)
    const event = await f.client.qualityJourneyEvent.findFirstOrThrow({
      where: { journeyId: f.scope.journeyId, eventType: 'RESOURCE_EXPLORER_RECONCILED_WITHOUT_COMMIT' },
    })
    expect(JSON.parse(event.payloadJson)).toMatchObject({
      originalAttemptId: f.original.id,
      originalFailure: JSON.parse(f.original.failureJson!),
    })
    await f.client.environment.update({
      where: { id: 'discovery-env' },
      data: {
        username: 'scoped-user',
        passwordEnvironmentVariable: 'LOCAL_LOGIN_PASSWORD',
        scopeVersion: { increment: 1 },
      },
    })
    const retryInput = { ...f.scope, expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash }
    const retry = await createAppManagedDiscoveryCorrection(retryInput, f.client)
    expect((await createAppManagedDiscoveryCorrection(retryInput, f.connect())).replayed).toBe(true)
    const next = retry.discoveryRevision
    expect(next.id).not.toBe(f.discovery.id)
    expect(next.environmentRegistryHash).not.toBe(before.environmentRegistryHash)
    expect(next.analysisRevisionId).toBe(before.analysisRevisionId)
    expect(next.targetObservationHash).toBeNull()
    expect(next.resourceWorkItemId).not.toBe(before.resourceWorkItemId)
    expect(next.scoutWorkItemId).not.toBe(before.scoutWorkItemId)
    sender.run.mockImplementation(async (prompt: string) => discoveryOutput(prompt))
    const input = { ...f.scope, expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash }
    await expect(startAppManagedDiscovery({ ...input, role: 'SCOUT' }, f.client)).rejects.toThrow(
      'waiting for evidence',
    )
    await expect(startAppManagedDiscovery({ ...input, role: 'RESOURCE_EXPLORER' }, f.client)).resolves.toMatchObject({
      accepted: true,
    })
    const fresh = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: next.resourceWorkItemId },
    })
    expect(fresh.id).not.toBe(original.id)
    expect(fresh.authorizationId).not.toBe(original.authorizationId)
    expect(fresh.assignmentId).not.toBe(original.assignmentId)
    await capture({ ...f, discovery: next })
    await expect(startAppManagedDiscovery({ ...input, role: 'SCOUT' }, f.client)).resolves.toMatchObject({
      accepted: true,
    })
    expect(sender.run).toHaveBeenCalledTimes(4)
    expect((await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: next.id } })).status).toBe(
      'COMPLETED',
    )
    expect(
      (await f.client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: f.discovery.id } }))
        .targetObservationHash,
    ).toBe(before.targetObservationHash)
  })

  it('refuses uncertain native work and preserves its original markers', async () => {
    const f = await discoveryReady()
    sender.run.mockRejectedValue(new Error('native UNKNOWN'))
    await expect(startAppManagedDiscovery({ ...f.input, role: 'RESOURCE_EXPLORER' }, f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const before = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: f.discovery.resourceWorkItemId },
    })
    await expect(requestAppManagedExplorerCorrection(f.input, f.client)).rejects.toThrow('uncertain')
    expect(await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
    expect(sender.run).toHaveBeenCalledTimes(1)
  })

  it('refuses partial success evidence, ownership change and frozen-scope changes without mutating the original', async () => {
    const f = await rejectedExplorer()
    await f.client.qualityJourneyWorkAttempt.update({
      where: { id: f.original.id },
      data: { resultHash: `sha256:${'a'.repeat(64)}` },
    })
    await expect(requestAppManagedExplorerCorrection(f.input, f.client)).rejects.toThrow('no exact failed')
    await f.client.qualityJourneyWorkAttempt.update({ where: { id: f.original.id }, data: { resultHash: null } })
    await f.client.environment.update({ where: { id: 'discovery-env' }, data: { baseUrl: 'http://127.0.0.1:44082' } })
    await expect(requestAppManagedExplorerCorrection(f.input, f.client)).rejects.toThrow('stale')
    const after = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: f.original.id } })
    expect(after).toEqual(f.original)
    const session = (await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }))
      .currentCoordinatorSessionId!
    await f.client.qualityJourneyCoordinatorSession.update({
      where: { id: session },
      data: { ownerPrincipalId: 'different-owner' },
    })
    await expect(requestAppManagedExplorerCorrection(f.input, f.client)).rejects.toThrow('original current')
    expect(sender.run).toHaveBeenCalledTimes(2)
  })
})
