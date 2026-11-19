import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from '@/services/coordinator/quality-journey-process-supervisor'
import {
  captureNativeQualificationPlan,
  nativeQualificationDigest,
  renderNativeQualificationConfiguration,
} from './native-qualification-contract'
import { syntheticNativeManifest } from './native-qualification.test-support'
import {
  expectedNativeMcpConfiguration,
  nativeQualificationFeatureControls,
  verifyNativeQualificationConfiguration,
} from './native-qualification-configuration'
import {
  launchNativeQualificationChild,
  claimOriginalNativeQualificationChild,
  originalNativeQualificationLossOwner,
  type NativeChildOutcomeObserver,
} from './native-qualification-child'
import { NativeStartupMetadata, nativeStartupWarning } from './native-startup-metadata'
import {
  assertNativeQualificationLossGateway,
  assertNativeQualificationLossQuiescent,
  bindNativeQualificationLossControl,
  bindNativeQualificationLossRuntime,
  createNativeQualificationLossControl,
  inspectNativeQualificationLoss,
  waitNativeQualificationLossPhysicalRelease,
  waitNativeQualificationLossQuiescence,
} from './native-qualification-loss'
import type { NativeOutcomeProfile } from './native-outcome-profile'

// Actual owned Node stdio, protocol, original SDK supervisor, canonical Prisma pause/get and cleanup execute.
// The native executable and profile token are explicit inert test fixtures; no real native/model is qualified.
describe('original R2 withheld start ACK through genuine inert child and canonical pause', () => {
  it.each(['valid-ack', 'invalid-samechunk'] as const)(
    '%s retains the real SDK/canonical ACK boundary',
    async mode => {
      const f = await createProviderFixture(),
        n = syntheticNativeManifest()
      let child: Awaited<ReturnType<typeof launchNativeQualificationChild>> | undefined
      let supervisor: ReturnType<typeof createQualityJourneyProcessSupervisor> | undefined
      let originalDisconnect: (() => boolean) | undefined
      let settled = false
      const envelope = [{ type: 'text', text: 'approved' }]
      const threadId = '019a8b91-41d3-7abc-8def-0123456789ab'
      try {
        const database = lstatSync(f.databasePath, { bigint: true })
        n.manifest.database = { path: f.databasePath, dev: String(database.dev), ino: String(database.ino) }
        n.manifest.binding = Object.fromEntries(
          Object.keys(n.manifest.binding).map(key => [key, f.prepareInput[key as keyof typeof f.prepareInput]]),
        ) as typeof n.manifest.binding
        n.manifest.envelopeDigest = nativeQualificationDigest(
          canonicalContractJson({ input: envelope, model: 'gpt-6.1-sol', effort: 'medium' }),
        )
        n.manifest.limits.requestMs = 2000
        n.manifest.limits.acknowledgementMs = 2000
        n.manifest.limits.cleanupMs = 4000
        n.manifest.configurationSha256 = n.sha(renderNativeQualificationConfiguration(n.manifest, n.capability))
        const configuration = {
          origins: {},
          config: {
            model: 'gpt-6.1-sol',
            model_provider: 'openai',
            model_reasoning_effort: 'medium',
            approval_policy: 'never',
            sandbox_mode: 'read-only',
            web_search: 'disabled',
            cli_auth_credentials_store: 'file',
            mcp_oauth_credentials_store: 'file',
            features: Object.fromEntries(nativeQualificationFeatureControls.map(key => [key, false])),
            analytics: { enabled: false },
            feedback: { enabled: false },
            history: { persistence: 'none' },
            mcp_servers: { appraise_worker: expectedNativeMcpConfiguration(n.manifest, n.capability) },
          },
        }
        let body = readFileSync(new URL('./fixtures/inert-startup-metadata.cjs', import.meta.url), 'utf8').replaceAll(
          'inert-thread',
          threadId,
        )
        if (mode === 'invalid-samechunk')
          body = body.replace(
            "send({ id: request.id, result: { turn: { id: 'inert-turn', items: [], status: 'inProgress' } } })",
            "process.stdout.write(JSON.stringify({ id: request.id, result: { turn: { id: 'inert-turn', items: [], status: 'inProgress' } } }) + '\\n' + JSON.stringify({ method: 'unrecognized/private', params: {} }) + '\\n')",
          )
        writeFileSync(
          n.manifest.native.path,
          `#!${process.execPath}\nconst startupScenario = 'same-chunk'\nconst startupWarning = ${JSON.stringify(nativeStartupWarning)}\nconst safeConfiguration = ${JSON.stringify(configuration)}\n` +
            body,
          { mode: 0o700 },
        )
        n.manifest.native.sha256 = n.sha(readFileSync(n.manifest.native.path))
        const plan = captureNativeQualificationPlan(n.manifest, n.capability),
          profile = Object.freeze({}) as NativeOutcomeProfile
        const current = await getQualityJourney(f.scope, f.client)
        const loss = createNativeQualificationLossControl({
          caseKind: 'R2_NATIVE_START_ACK_LOSS',
          fixture: f,
          client: f.client,
          plan,
          profile,
          absoluteCleanupDeadline: Date.now() + n.manifest.limits.caseMs + n.manifest.limits.cleanupMs,
          pause: {
            expectedVersion: current.journey.version,
            expectedStateHash: current.journey.stateHash,
            idempotencyKey: 'inert-r2-pause',
            reason: 'inert qualification start reply loss',
          },
        })
        bindNativeQualificationLossControl(loss, {
          fixture: f,
          client: f.client,
          plan,
          profile,
          scope: { ...f.scope, workItemId: f.prepareInput.workItemId, attemptId: f.prepareInput.attemptId },
        })
        let closeCalls = 0,
          heldCallback = false,
          disconnectReturned: boolean | undefined
        const startup = new NativeStartupMetadata()
        const observer: NativeChildOutcomeObserver = {
          validatedInitialize: () => startup.validatedInitialize(),
          closeStartup: () => startup.close(),
          startupReady: (deadline, signal) => startup.wait(deadline, signal),
          admitStartup: () => startup.admit(),
          beforeRequest(method) {
            if (method === 'thread/start') startup.assertReady()
          },
          operation(operation, method) {
            void operation
              .then(
                value => {
                  if (method === 'initialize') startup.settledInitialize()
                  if (method === 'config/read') {
                    if (!verifyNativeQualificationConfiguration(value, n.manifest, n.capability))
                      throw new Error('strict config refused')
                    startup.verifiedConfiguration()
                  }
                },
                () => startup.close(),
              )
              .catch(() => startup.close())
          },
          notification(method, params) {
            if (method === 'configWarning' || method === 'account/updated') startup.notification(method, params)
          },
          fault: () => startup.close(),
          cleanup: () => startup.close(),
        }
        supervisor = createQualityJourneyProcessSupervisor(
          {
            ...f.prepareInput,
            configurationDigest: `sha256:${n.manifest.configurationSha256}`,
            envelopeDigest: n.manifest.envelopeDigest,
          },
          {
            capability: trustedJourneyProcessAdapter,
            configurationDigest: `sha256:${n.manifest.configurationSha256}`,
            input: envelope,
            turnAcknowledgementTimeoutMs: 2000,
            validateReadiness: value => !!value && typeof value === 'object' && 'codexHome' in value,
            nativeReadiness: {
              cwd: path.join(n.manifest.freshRoot, 'cwd'),
              validateConfiguration: value => verifyNativeQualificationConfiguration(value, n.manifest, n.capability),
              validateThread: value => (value as { thread?: { id?: string } }).thread?.id === threadId,
              validateRequiredMcp: value => Array.isArray((value as { data?: unknown }).data),
              mcpStatusParams: { serverName: 'appraise_worker', detail: 'full', limit: 1 },
            },
            async launch(callbacks) {
              child = await launchNativeQualificationChild(plan, {
                ...callbacks,
                qualificationLoss: loss,
                assertAdmission() {
                  if (supervisor!.snapshot().fenced) throw new Error('SDK fenced')
                },
                fenceMcp() {},
                async closeMcp() {
                  closeCalls++
                  if (mode === 'valid-ack')
                    expect(inspectNativeQualificationLoss(loss).proof.PAUSE_COMMITTED).toBe(true)
                  return true
                },
                captureOriginalDisconnect(disconnect) {
                  originalDisconnect = disconnect
                },
              })
              claimOriginalNativeQualificationChild(child, plan, observer)
              bindNativeQualificationLossRuntime(loss, {
                child,
                owner: originalNativeQualificationLossOwner(child, plan),
                endpoint: Object.freeze({}),
                logicalFence() {
                  heldCallback = inspectNativeQualificationLoss(loss).phase === 'HOLDING'
                  expect(closeCalls).toBe(0)
                  expect(existsSync(path.join(n.manifest.freshRoot, 'codex-home', 'auth.json'))).toBe(true)
                  disconnectReturned = originalDisconnect?.()
                  expect(disconnectReturned).toBe(false)
                  child!.transport.fence('qualification_loss')
                  const first = child!.stop(),
                    second = child!.stop()
                  expect(first).toBe(second)
                  void supervisor!.cancel().catch(() => {})
                },
              })
              return child
            },
          },
          f.client,
        )
        expect(() => assertNativeQualificationLossGateway(loss)).toThrow()
        await expect(supervisor.start()).rejects.toThrow()
        await waitNativeQualificationLossPhysicalRelease(loss)
        await supervisor.waitOriginalStop()
        await waitNativeQualificationLossQuiescence(loss)
        const state = inspectNativeQualificationLoss(loss),
          canonical = await getQualityJourney(f.scope, f.client)
        expect(
          await f.client.qualityJourneyProviderObservation.count({
            where: { kind: { in: ['ACKNOWLEDGED', 'ACK_CONFLICT'] } },
          }),
        ).toBe(0)
        expect(supervisor.snapshot().turnId).toBeUndefined()
        expect(child!.transport.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 5, pendingRequests: 0 })
        if (mode === 'valid-ack') {
          expect(heldCallback).toBe(true)
          expect(disconnectReturned).toBe(false)
          expect(state.proof).toEqual({ VALIDATED: true, WITHHELD: true, PAUSE_COMMITTED: true, UNPROVEN: false })
          expect(canonical.journey.status).toBe('PAUSED')
          expect(canonical.events.filter(event => event.eventType === 'OPERATIONAL_PAUSE')).toHaveLength(1)
          expect(closeCalls).toBe(1)
          expect(supervisor.snapshot().cleanup).toMatchObject({
            status: 'stopped',
            groupExitObserved: true,
            privateRootRemoved: true,
          })
          assertNativeQualificationLossQuiescent(loss)
          settled = true
        } else {
          expect(state.proof).toMatchObject({
            VALIDATED: false,
            WITHHELD: false,
            PAUSE_COMMITTED: false,
            UNPROVEN: true,
          })
          expect(canonical.journey.status).toBe('ACTIVE')
          expect(() => assertNativeQualificationLossQuiescent(loss)).toThrow()
        }
      } finally {
        if (supervisor) await supervisor.cancel().catch(() => {})
        if (settled) {
          await f.cleanup()
          rmSync(n.parent, { recursive: true, force: true })
        } else {
          await f.client.$disconnect()
          process.stderr.write('INERT_R2_UNKNOWN_FIXTURES_RETAINED\n')
        }
      }
    },
    20000,
  )
})
