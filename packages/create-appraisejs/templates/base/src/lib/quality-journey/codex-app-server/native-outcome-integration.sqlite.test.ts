import { canonicalContractJson } from '@/lib/catalog-contracts'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { createOriginalNativeOutcomeCandidate } from './native-outcome-source'
import type { NativeOutcomeProfile } from './native-outcome-profile'
import type { CapturedNativeQualificationPlan } from './native-qualification-contract'
import type { NativeChildOutcomeObserver } from './native-qualification-child'
import type { OwnedFixtureChild } from './owned-child'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import { RpcTransport } from './rpc-transport'
import { nativeStartupWarning } from './native-startup-metadata'
import { trustedProviderObservation, trustedProviderReconciliation } from '../provider-intent-contract'
import { createProviderSourceNativePrismaClient, disposeProviderSourceDatabase } from '../provider-source-database'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
  writeQualityJourneyProviderTransport,
  recordQualityJourneyProviderAcknowledgement,
  reconcileConsumedQualityJourneyProviderIntent,
} from '@/services/coordinator/quality-journey-provider-run-service'
const fake = vi.hoisted(() => ({ claim: vi.fn(), profile: vi.fn(), plan: vi.fn() }))
vi.mock('./native-qualification-child', () => ({ claimOriginalNativeQualificationChild: fake.claim }))
vi.mock('./native-outcome-profile', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-outcome-profile')>()),
  nativeOutcomeProtocolDigest: `sha256:${'c'.repeat(64)}`,
  inspectNativeOutcomeProfile: fake.profile,
}))
vi.mock('./native-qualification-contract', () => ({ inspectNativeQualificationPlan: fake.plan }))
vi.mock('./native-qualification-configuration', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-qualification-configuration')>()),
  verifyNativeQualificationConfiguration: () => true,
}))

// Actual native source/journal/database/service/SQLite execute. Only native process acquisition/profile
// are replaced by source-only transport observations; no actual native/provider/account effect exists.
describe.sequential('registered original native custody on actual disposable canonical SQLite', () => {
  it('atomically commits one terminal reconciliation and replays positively without another release or native write', async () => {
    const f = await createProviderFixture()
    await f.client.$disconnect()
    const pair = createProviderSourceNativePrismaClient(`file:${f.databasePath}`),
      database = await pair.ready
    const client = pair.client,
      configurationDigest = `sha256:${'a'.repeat(64)}`
    const input = { ...f.prepareInput, providerNamespace: `native:source-fake:${randomUUID()}`, configurationDigest }
    const prepared = await prepareQualityJourneyProviderRun(input, client)
    const request = { ...input, intentId: prepared.intent.id, claimOwner: 'native-source-fake' }
    const claimed = await claimQualityJourneyProviderIntent(request, client)
    const armed = await armQualityJourneyProviderIntent({ ...request, claimEpoch: claimed.intent.claimEpoch }, client)
    if (!armed.permit) throw new Error('Original permit missing')
    const plan = {} as CapturedNativeQualificationPlan,
      profile = {} as NativeOutcomeProfile
    const control = {
      reviewerId: 'independent-offline-review',
      nonce: randomUUID(),
      reviewMs: 10000,
      reconciliationMs: 10000,
    }
    const envelope = { input: [{ type: 'text', text: 'native source fake' }], model: 'gpt-5.5', effort: 'medium' }
    fake.profile.mockReturnValue({
      profileDigest: configurationDigest,
      dossierDigest: configurationDigest,
      artifactDigest: configurationDigest,
      configurationDigest,
      plan,
      reviewControlDigest: outcomeDigest(canonicalContractJson(control)),
    })
    fake.plan.mockReturnValue({
      manifest: { freshRoot: '/private/source-fake', envelopeDigest: outcomeDigest(canonicalOutcomeJson(envelope)) },
      capability: 'private',
    })
    const stdout = new PassThrough(),
      stderr = new PassThrough(),
      stdin = new Writable({
        write(_chunk, _encoding, done) {
          done()
        },
      })
    const transportId = randomUUID(),
      raw = new RpcTransport({ stdin, stdout, stderr }, { transportId, onNotification() {}, onFault() {} })
    let observer!: NativeChildOutcomeObserver
    fake.claim.mockImplementation((_child, _plan, observed) => {
      observer = observed
      return {
        fence: () => raw.fence('source_poison'),
        owner: raw.owner,
        sealSender: () => raw.sealSender(),
        snapshot: () => raw.snapshot(),
      }
    })
    const candidate = await createOriginalNativeOutcomeCandidate({
      profile,
      permit: armed.permit,
      database,
      providerNamespace: input.providerNamespace,
      transportId,
      reviewControl: control,
    })
    candidate.attach({} as OwnedFixtureChild)
    const threadId = '019a8b91-41d3-7abc-8def-0123456789ab',
      turnId = randomUUID()
    async function send(
      method: Parameters<NativeChildOutcomeObserver['beforeRequest']>[0],
      params: Record<string, unknown>,
      response: unknown,
      consume = false,
    ) {
      if (method === 'thread/start') await observer.startupReady!(Date.now() + 1000)
      const operation = writeQualityJourneyProviderTransport(
        { ...input, permit: armed.permit!, consume },
        () => {
          observer.beforeRequest(method, params)
          if (method === 'thread/start') observer.admitStartup!()
          const original = raw.request(method, params)
          observer.operation(original, method)
          if (method === 'initialize') observer.validatedInitialize!()
          if (method === 'thread/start')
            observer.notification('thread/started', { thread: { id: threadId, ephemeral: true, turns: [] } })
          stdout.write(`${JSON.stringify({ id: raw.snapshot().issuedRequests, result: response })}\n`)
          return original
        },
        client,
      )
      candidate.supervisorOperation(operation)
      const box = await operation
      await box.reply
    }
    try {
      await send(
        'initialize',
        { capabilities: { experimentalApi: false }, clientInfo: { name: 'appraise-journey-supervisor', version: '1' } },
        {},
      )
      observer.notification('configWarning', { summary: nativeStartupWarning })
      observer.notification('account/updated', { authMode: 'chatgpt', planType: 'unknown' })
      const initialized = raw.notifyInitialized()
      observer.operation(initialized, 'initialized')
      await initialized
      await send('config/read', { cwd: '/private/source-fake/cwd', includeLayers: false }, { config: {} })
      await send(
        'thread/start',
        {
          cwd: '/private/source-fake/cwd',
          ephemeral: true,
          model: 'gpt-5.5',
          approvalPolicy: 'never',
          sandbox: 'read-only',
        },
        { thread: { id: threadId, ephemeral: true, turns: [] } },
      )
      await send('mcpServerStatus/list', { threadId, serverName: 'appraise_worker', detail: 'full', limit: 1 }, {})
      await send('turn/start', { threadId, ...envelope }, { turn: { id: turnId } }, true)
      await recordQualityJourneyProviderAcknowledgement(
        {
          intentId: prepared.intent.id,
          sendBoundaryId: armed.permit.sendBoundaryId,
          providerNamespace: input.providerNamespace,
          threadId,
          turnId,
          observationKey: 'native-fake-ack',
          evidenceDigest: configurationDigest,
        },
        trustedProviderObservation,
        client,
      )
      observer.notification('turn/completed', { threadId, turn: { id: turnId, status: 'completed', error: null } })
      raw.fence('logical_completion')
      const originalSdkClose = Promise.resolve({ closed: true, effectUnknown: false })
      candidate.captureSdkClose(originalSdkClose)
      await originalSdkClose
      await Promise.resolve()
      candidate.captureSupervisorStop(Promise.resolve())
      observer.cleanup({
        status: 'stopped',
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      })
      const body = await candidate.freezeCandidate(),
        before = raw.snapshot()
      const enrollment = candidate.acceptTaskReview({
        version: 'M13_NATIVE_OUTCOME_REVIEW_V1',
        decision: 'ACCEPT',
        reviewerId: control.reviewerId,
        nonce: control.nonce,
        candidateDigest: body.candidateDigest,
        dossierDigest: String(body.dossierDigest),
        profileDigest: String(body.profileDigest),
        artifactDigest: String(body.artifactDigest),
        identityDigest: String(body.identityDigest),
        actualReviewReceiptDigest: configurationDigest,
      })
      const reconciliation = {
        intentId: prepared.intent.id,
        observationKey: 'native-fake-reconciliation',
        senderExcluded: enrollment.senderExcluded,
        physicalEvidence: enrollment.physicalEvidence,
      }
      const result = await reconcileConsumedQualityJourneyProviderIntent(
        reconciliation,
        enrollment.context,
        trustedProviderReconciliation,
        client,
      )
      expect(result).toMatchObject({ conflicted: false, replayed: false })
      const source = await client.qualityJourneyProviderSourceState.findUniqueOrThrow({
        where: { intentId: prepared.intent.id },
      })
      expect(source).toMatchObject({ lifecycle: 'COMMITTED', sequence: 2, commitFenceVersion: 1 })
      expect(JSON.parse(source.identityJson)).toMatchObject({
        threadId: null,
        turnId: null,
        transportIncarnation: null,
      })
      await expect(
        reconcileConsumedQualityJourneyProviderIntent(
          { ...reconciliation, intentId: 'foreign-intent' },
          enrollment.context,
          trustedProviderReconciliation,
          client,
        ),
      ).rejects.toThrow()
      await expect(
        reconcileConsumedQualityJourneyProviderIntent(
          {
            intentId: 'foreign-intent',
            observationKey: reconciliation.observationKey,
            replayRequestHash: result.requestHash,
          },
          enrollment.context,
          trustedProviderReconciliation,
          client,
        ),
      ).rejects.toThrow()
      const replay = await reconcileConsumedQualityJourneyProviderIntent(
        reconciliation,
        enrollment.context,
        trustedProviderReconciliation,
        client,
      )
      expect(replay).toMatchObject({ replayed: true, receipt: result.receipt })
      expect(raw.snapshot()).toEqual(before)
      expect(
        await client.qualityJourneyProviderSourceState.findUniqueOrThrow({ where: { sourceId: source.sourceId } }),
      ).toEqual(source)
      const observations = await client.qualityJourneyProviderObservation.count({
        where: { intentId: prepared.intent.id, observationKey: reconciliation.observationKey },
      })
      expect(observations).toBe(1)
      const restartReader = new PrismaClient({ datasources: { db: { url: `file:${f.databasePath}` } } })
      try {
        const durableReplay = await reconcileConsumedQualityJourneyProviderIntent(
          {
            intentId: prepared.intent.id,
            observationKey: reconciliation.observationKey,
            replayRequestHash: result.requestHash,
          },
          { selection: 'NATIVE' },
          trustedProviderReconciliation,
          restartReader,
        )
        expect(durableReplay).toMatchObject({ replayed: true, receipt: result.receipt })
        expect(
          await restartReader.qualityJourneyProviderSourceState.findUniqueOrThrow({
            where: { sourceId: source.sourceId },
          }),
        ).toEqual(source)
        expect(raw.snapshot()).toEqual(before)
      } finally {
        await restartReader.$disconnect()
      }
    } finally {
      raw.fence('test_cleanup')
      await disposeProviderSourceDatabase(database)
      await f.cleanup()
    }
  })
})
