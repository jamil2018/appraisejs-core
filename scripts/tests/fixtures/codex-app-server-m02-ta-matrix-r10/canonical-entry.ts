/** Disposable T2 canonical fixture exports. No database is opened by import. */
import { randomBytes } from 'node:crypto'
import { basename, dirname } from 'node:path'
import type { QualityJourneyRole } from '@prisma/client'
import { createCanonicalAcceptanceFixture } from '../codex-app-server-m02-ta/canonical-fixture'
import { createCanonicalSupervisorBridge } from '../codex-app-server-m02-ta/canonical-bridge'
import { createLoopbackTrustedWorkerExchange } from '../../../../packages/appraisejs/src/mcp/trusted-worker-bridge'

export {
  createTrustedWorkerBridgeClient,
  createTrustedWorkerBridgeEndpoint,
} from '../../../../packages/appraisejs/src/mcp/trusted-worker-bridge'

export { createCanonicalAcceptanceFixture, canonicalOperations } from '../codex-app-server-m02-ta/canonical-fixture'
export { canonicalPacket } from '../codex-app-server-m02-ta/canonical-packets'
export {
  createCanonicalSupervisorBridge,
  createLazyCanonicalSupervisorBridge,
} from '../codex-app-server-m02-ta/canonical-bridge'

/** Exposes only this case's disposable fixture to the reviewed script planner. */
export function createMatrixCanonicalBridge(options: {
  role: QualityJourneyRole
  workspace: string
  caseId: string
  onUnknown: (reason: 'request' | 'acceptance' | 'after_io') => Promise<void> | void
}) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(options.caseId) || basename(dirname(options.workspace)) !== options.caseId)
    throw new Error('Canonical bridge case and workspace do not match.')
  const capability = randomBytes(32).toString('base64url')
  let initialized:
    | Promise<{
        fixture: Awaited<ReturnType<typeof createCanonicalAcceptanceFixture>>
        bridge: ReturnType<typeof createCanonicalSupervisorBridge>
      }>
    | undefined
  let readyCandidate: { bridge: ReturnType<typeof createCanonicalSupervisorBridge> } | undefined
  const get = () =>
    (initialized ??= (async () => {
      const fixture = await createCanonicalAcceptanceFixture(options.role, {
        workspace: options.workspace,
        cleanupOnClose: false,
      })
      const ready = {
        fixture,
        bridge: createCanonicalSupervisorBridge({
          fixture,
          caseId: options.caseId,
          capability,
          onUnknown: options.onUnknown,
        }),
      }
      readyCandidate = ready
      return ready
    })())
  return Object.freeze({
    /** Trusted listener binding only; never serialized into an audit receipt. */
    auditCapability() {
      return capability
    },
    bootstrapConfig(url: string) {
      createLoopbackTrustedWorkerExchange(url)
      return { schema: 'appraise.m02-ta-bridge-bootstrap/v1', caseId: options.caseId, capability, url }
    },
    async handle(raw: unknown) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
      if (!value || value.caseId !== options.caseId || value.capability !== capability)
        return {
          requestId:
            typeof value?.requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId)
              ? value.requestId
              : 'invalid',
          ok: false,
          code: 'INVALID',
        }
      return (await get()).bridge.handle(raw)
    },
    ready: get,
    get fenced() {
      return readyCandidate?.bridge.fenced ?? false
    },
    async close() {
      const ready = await initialized?.catch(() => null)
      if (ready) await ready.fixture.close()
    },
  })
}
