import { prepareTrustedCase, TrustedCaseCoordinator } from './composition.mjs'
import { createNativePorts } from './runtime-effects.mjs'
import { TrustedAppServerPeer } from './protocol.mjs'

/**
 * Inert composition root. Host approval, exact executable artifacts, canonical validators and
 * actual descriptor review remain external prerequisites. Merely constructing this opens nothing.
 * Real ports are never selected by T0 tests: they inject every OS-facing operation.
 */
export function createTrustedLauncher({
  prepared,
  journal,
  authorize,
  io,
  clock,
  verifyMcpStartup,
  verifyRequiredMcpFailure,
}) {
  let ports
  const coordinator = new TrustedCaseCoordinator({
    journal,
    clock,
    onDeadline: async () => {
      if (ports) await ports.stopOwned()
    },
  })
  ports = createNativePorts({
    prepared,
    authorize,
    ...(io ? { io } : {}),
    withReservation: coordinator.perform.bind(coordinator),
    consumeReservation: coordinator.consumeReservation.bind(coordinator),
    recordRecovery: async reason => {
      journal.recordRecovery({ id: `${journal.snapshot().activeCase}-${reason}`, action: reason })
    },
    onUncertain: async () => {
      if (!journal.snapshot().fenced) journal.markUnknown()
      if (ports && (ports.snapshot().ownedChildren || ports.snapshot().ownedListeners))
        await ports.stopOwned().catch(() => {})
    },
  })
  return Object.freeze({
    async startCase({ caseId, request, onCaptured, canonicalBridge }) {
      if (!prepared.manifest.cases.includes(caseId)) throw new Error('case not in approved phase')
      const mcp = prepared.manifest.artifacts.find(item => item.purpose === 'scoped-mcp-entry')
      const interpreter = prepared.manifest.artifacts.find(item => item.purpose === 'interpreter')
      if (!mcp || !interpreter) throw new Error('scoped child entry/interpreter missing')
      if (typeof canonicalBridge?.handle !== 'function' || typeof canonicalBridge?.bootstrapConfig !== 'function')
        throw new Error('canonical bridge composition required')
      await coordinator.begin(caseId)
      let captureProof = null
      const provider = await ports.startProvider({
        id: `${caseId}-listener`,
        caseId,
        request,
        onCaptured: async request => {
          captureProof = await onCaptured(request)
          return captureProof
        },
        canonicalRequest: canonicalBridge.handle,
      })
      const config = prepareTrustedCase(prepared, caseId, {
        port: provider.port,
        mcpExecutable: interpreter.path,
        mcpArgs: [mcp.path, '--m02-ta-scoped-worker', ...(caseId === 'P00' ? ['--m02-ta-required-failure'] : [])],
      })
      await ports.writeBootstrap({
        id: `${caseId}-bootstrap`,
        caseId,
        value: canonicalBridge.bootstrapConfig(`http://127.0.0.1:${provider.port}/m02/canonical`),
      })
      const child = await ports.spawnCodex({ id: `${caseId}-codex`, caseId, cwd: config.cwd, env: config.env })
      const peer = new TrustedAppServerPeer({
        coordinator,
        journal,
        caseId,
        verifyMcpStartup,
        verifyRequiredMcpFailure,
        threadStartParams: config.threadStartParams,
        verifyCaptureTerminal: () =>
          caseId === 'T1' &&
          captureProof?.status === 'CAPTURED' &&
          journal.snapshot().counts.providerRequests === 1 &&
          journal.snapshot().counts.scopedCalls === 0,
        write: async (bytes, reservation) => {
          await ports.sendOwned({
            child,
            frame: JSON.parse(bytes),
            id: reservation.id,
            kind: reservation.kind,
            reservation,
          })
          return bytes.length
        },
      })
      if (!child.stdout?.on || !child.stderr?.on) throw new Error('owned stdio channels missing')
      let pump = Promise.resolve()
      let stderrBytes = 0
      const uncertain = () => {
        if (!journal.snapshot().fenced) journal.markUnknown()
      }
      child.stdout.on('data', bytes => {
        pump = pump.then(() => peer.feed(bytes)).catch(uncertain)
      })
      child.stdout.on('end', () => {
        pump = pump.then(() => peer.eof()).catch(uncertain)
      })
      child.stderr.on('data', bytes => {
        stderrBytes += bytes.length
        if (stderrBytes > 65536) uncertain()
      })
      child.on('error', uncertain)
      child.stdin.on?.('error', uncertain)
      child.on('exit', () => {
        pump = pump
          .then(() => {
            if (
              !['terminal', 'required-mcp-failed', 'permission-denied', 'capture-stopped'].includes(
                peer.snapshot().phase,
              )
            )
              uncertain()
          })
          .catch(uncertain)
      })
      return Object.freeze({
        config,
        child,
        provider,
        peer,
        coordinator,
        stopOwned: () => ports.stopOwned({ child, server: provider.server }),
      })
    },
    snapshot: () => ({ ...ports.snapshot(), journal: journal.snapshot(), runtimeQualified: false }),
  })
}
