/** Supervisor-side composition for the disposable M02-TA canonical backend. */
import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { basename, dirname } from 'node:path'
import type { QualityJourneyRole } from '@prisma/client'
import { createExternalWorkerMcpServer } from '../../../../packages/appraisejs/src/mcp/external-worker-server'
import {
  createLoopbackTrustedWorkerExchange,
  createTrustedWorkerBridgeServer,
} from '../../../../packages/appraisejs/src/mcp/trusted-worker-bridge'
import type { McpRegistryContext } from '../../../../packages/appraisejs/src/mcp/registry'
import { createCanonicalAcceptanceFixture } from './canonical-fixture'

type Fixture = Awaited<ReturnType<typeof createCanonicalAcceptanceFixture>>

export type CanonicalBridgeBootstrapConfig = {
  schema: 'appraise.m02-ta-bridge-bootstrap/v1'
  caseId: string
  capability: string
  url: string
}

/** No listener, child, config write or native turn is performed here. */
export function createCanonicalSupervisorBridge(options: {
  fixture: Fixture
  caseId: string
  capability: string
  onUnknown: (reason: 'request' | 'acceptance' | 'after_io') => Promise<void> | void
}) {
  const { fixture } = options
  const requestCorrelation = new AsyncLocalStorage<string>()
  let lastSubmissionCorrelation:
    { requestId: string; toolName: string; idempotencyKey: string; requestHash: string } | undefined
  const expected = createExternalWorkerMcpServer({
    context: {
      api: { request: fixture.gateway.request },
      options: {},
    } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: fixture.gateway.binding,
    frozenReads: fixture.gateway.frozenReads,
    authorize: fixture.gateway.authorize,
    readAcceptance: fixture.gateway.readAcceptance,
  })
  fixture.gateway.bindProfile(expected.profile.profileDigest)
  const server = createTrustedWorkerBridgeServer({
    caseId: options.caseId,
    capability: options.capability,
    binding: fixture.gateway.binding,
    frozenReads: fixture.gateway.frozenReads,
    expectedAdvertisedProfile: expected.advertisedProfile,
    authorize: fixture.gateway.authorize,
    request: async (path, requestOptions) => {
      const requestId = requestCorrelation.getStore()
      if (!requestId) throw new Error('Canonical request correlation is unavailable.')
      const identity = fixture.gateway.recoveryIdentity(path, requestOptions)
      lastSubmissionCorrelation = Object.freeze({ requestId, ...identity })
      return fixture.gateway.request(path, requestOptions)
    },
    readAcceptance: fixture.gateway.readAcceptance,
    onUnknown: options.onUnknown,
  })
  return Object.freeze({
    handle(raw: unknown) {
      const requestId =
        raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        typeof (raw as { requestId?: unknown }).requestId === 'string'
          ? (raw as { requestId: string }).requestId
          : ''
      return requestCorrelation.run(requestId, () => server.handle(raw))
    },
    get fenced() {
      return server.fenced
    },
    get lastSubmissionCorrelation() {
      return lastSubmissionCorrelation ?? null
    },
    async reconcileSubmission(input: { requestId: string }) {
      const saved = lastSubmissionCorrelation
      if (!saved || input.requestId !== saved.requestId)
        throw new Error('Canonical submission correlation is unavailable.')
      try {
        const accepted = await fixture.gateway.readAcceptance({
          binding: fixture.gateway.binding,
          toolName: saved.toolName,
          idempotencyKey: saved.idempotencyKey,
          requestHash: saved.requestHash,
        })
        if (
          accepted &&
          accepted.operation === saved.toolName &&
          accepted.idempotencyKey === saved.idempotencyKey &&
          accepted.requestHash === saved.requestHash &&
          accepted.assignmentId === fixture.gateway.binding.assignmentId &&
          accepted.attemptId === fixture.gateway.binding.attemptId &&
          accepted.receiptId &&
          accepted.artifactIds.length > 0
        )
          return {
            outcome: 'ACCEPTED' as const,
            requestId: saved.requestId,
            receiptId: accepted.receiptId,
            artifactIds: accepted.artifactIds,
          }
      } catch {
        // Missing or inconsistent durable evidence leaves the case unknown.
      }
      return { outcome: 'UNKNOWN' as const, requestId: saved.requestId }
    },
    advertisedProfile: expected.advertisedProfile,
    bootstrapConfig(url: string): CanonicalBridgeBootstrapConfig {
      createLoopbackTrustedWorkerExchange(url)
      return {
        schema: 'appraise.m02-ta-bridge-bootstrap/v1',
        caseId: options.caseId,
        capability: options.capability,
        url,
      }
    },
  })
}

/**
 * The phase owner creates the exact 0700 supervisor directory first. This
 * helper mints the case capability now, then opens only that fresh database on
 * the first bridge request after the existing provider listener is owned.
 */
export function createLazyCanonicalSupervisorBridge(options: {
  role: QualityJourneyRole
  workspace: string
  caseId: string
  onUnknown: (reason: 'request' | 'acceptance' | 'after_io') => Promise<void> | void
}) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(options.caseId) || basename(dirname(options.workspace)) !== options.caseId)
    throw new Error('Canonical bridge case and supervisor directory do not match.')
  const capability = randomBytes(32).toString('base64url')
  let initialized:
    | Promise<{
        fixture: Fixture
        bridge: ReturnType<typeof createCanonicalSupervisorBridge>
      }>
    | undefined
  let ready:
    | {
        fixture: Fixture
        bridge: ReturnType<typeof createCanonicalSupervisorBridge>
      }
    | undefined
  const get = () =>
    (initialized ??= (async () => {
      const fixture = await createCanonicalAcceptanceFixture(options.role, {
        workspace: options.workspace,
        cleanupOnClose: false,
      })
      ready = {
        fixture,
        bridge: createCanonicalSupervisorBridge({
          fixture,
          caseId: options.caseId,
          capability,
          onUnknown: options.onUnknown,
        }),
      }
      return ready
    })())
  return Object.freeze({
    bootstrapConfig(url: string): CanonicalBridgeBootstrapConfig {
      createLoopbackTrustedWorkerExchange(url)
      return { schema: 'appraise.m02-ta-bridge-bootstrap/v1', caseId: options.caseId, capability, url }
    },
    async handle(raw: unknown) {
      const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
      if (!candidate || candidate.caseId !== options.caseId || candidate.capability !== capability)
        return {
          requestId:
            typeof candidate?.requestId === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(candidate.requestId)
              ? candidate.requestId
              : 'invalid',
          ok: false,
          code: 'INVALID' as const,
        }
      return (await get()).bridge.handle(raw)
    },
    get lastSubmissionCorrelation() {
      return ready?.bridge.lastSubmissionCorrelation ?? null
    },
    async reconcileSubmission(input: { requestId: string }) {
      if (!initialized) throw new Error('Canonical submission correlation is unavailable.')
      return (await initialized).bridge.reconcileSubmission(input)
    },
    get fenced() {
      return ready?.bridge.fenced ?? false
    },
    async close() {
      if (!initialized) return
      const ready = await initialized.catch(() => null)
      if (ready) await ready.fixture.close()
    },
  })
}
