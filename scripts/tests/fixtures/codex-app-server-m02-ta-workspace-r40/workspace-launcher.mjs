import { prepareTrustedCase, TrustedCaseCoordinator } from './composition.mjs'
import { createNativePorts } from './native-ports.mjs'
import { TrustedMatrixAppServerPeer } from './protocol.mjs'
import { POLICY } from './policy.mjs'
import { createHash } from 'node:crypto'
const sha = value => createHash('sha256').update(value).digest('hex')

/**
 * Inert composition root. Host approval, exact executable artifacts, canonical validators and
 * actual descriptor review remain external prerequisites. Merely constructing this opens nothing.
 * Real ports are never selected by T0 tests: they inject every OS-facing operation.
 */
export function createTrustedLauncher({
  prepared,
  precreatedRootIdentity,
  journal,
  authorize,
  prepareCaseAdmission,
  io,
  clock,
  verifyMcpStartup,
  verifyRequiredMcpFailure,
  verifyRequiredMcpTelemetry,
  recordProtocolFailure = () => {},
  createObserver = null,
  createPorts = createNativePorts,
}) {
  if (typeof prepareCaseAdmission !== 'function') throw new Error('case admission preparation callback required')
  let ports
  let activePeer = null
  let failureRecorded = false
  const recordFailure = async details => {
    if (failureRecorded || journal.snapshot().fenced) return
    failureRecorded = true
    try {
      await recordProtocolFailure(details)
    } catch {
      /* A missing diagnostic must not prevent the authoritative UNKNOWN fence. */
    }
  }
  const runtimeFailure = category =>
    recordFailure({
      category,
      phase: activePeer?.snapshot().phase ?? 'new',
      pendingKind: activePeer?.snapshot().pendingKind ?? null,
      seq: journal.snapshot().seq ?? null,
      methodSha256: null,
      frameKind: 'invalid',
      safeRemoteStatus: null,
      hasEnvironment: false,
      envelopeFailureReason: null,
      timestampPresent: false,
    })
  const coordinator = new TrustedCaseCoordinator({
    journal,
    clock,
    onDeadline: async () => {
      if (ports) await ports.stopOwned()
    },
  })
  ports = createPorts({
    prepared,
    precreatedRootIdentity,
    authorize,
    ...(io ? { io } : {}),
    withReservation: coordinator.perform.bind(coordinator),
    consumeReservation: coordinator.consumeReservation.bind(coordinator),
    recordRecovery: async reason => {
      if (journal.snapshot().fenced)
        journal.recordRecovery({ id: `${journal.snapshot().activeCase}-${reason}`, action: reason })
    },
    onUncertain: async () => {
      await runtimeFailure('OWNED_EFFECT_UNCERTAIN')
      if (!journal.snapshot().fenced) journal.markUnknown()
      if (ports && (ports.snapshot().ownedChildren || ports.snapshot().ownedListeners))
        await ports.stopOwned().catch(() => {})
    },
  })
  return Object.freeze({
    async startCase({
      caseId,
      request,
      prepareScript,
      auditSession,
      onCaptured,
      onProviderFailure,
      canonicalBridge,
      verifyMcpStartupCase,
      verifyRequiredMcpFailureCase,
      verifyRequiredMcpTelemetryCase,
      verifyPermissionRequest,
      verifyPermissionTerminal,
    }) {
      if (!['N01', 'N02'].includes(caseId) || !prepared.manifest.cases.includes(caseId))
        throw new Error('case not in approved T3 phase')
      const mcp = prepared.manifest.artifacts.find(item => item.purpose === 'scoped-mcp-entry')
      const interpreter = prepared.manifest.artifacts.find(item => item.purpose === 'interpreter')
      if (!mcp || !interpreter) throw new Error('scoped child entry/interpreter missing')
      if (typeof canonicalBridge?.handle !== 'function' || typeof canonicalBridge?.bootstrapConfig !== 'function')
        throw new Error('canonical bridge composition required')
      if (auditSession !== undefined && auditSession !== null) throw new Error('T3 scoped audit forbidden')
      if (typeof createObserver !== 'function') throw new Error('owned Code Mode host observer required')
      await coordinator.checkPhaseAdmission('T3')
      await prepareCaseAdmission({ caseId, assertPhaseBudget: () => coordinator.checkPhaseAdmission('T3') })
      await coordinator.checkPhaseAdmission('T3')
      await coordinator.begin(caseId)
      let captureProof = null
      let scriptedRequest = request
      let activePeerForProvider = null
      let activeConfigForProvider = null
      const provider = await ports.startProvider({
        id: `${caseId}-listener`,
        caseId,
        request: async input => {
          const observed = activePeerForProvider?.snapshot()
          const campaign = journal.snapshot()
          if (
            campaign.activeCase !== caseId ||
            campaign.fenced ||
            observed?.phase !== 'turn' ||
            campaign.pending.some(item => ['threadStarts', 'turnStarts'].includes(item.kind)) ||
            !observed?.threadId ||
            !observed?.turnId ||
            !activeConfigForProvider ||
            !Number.isSafeInteger(input.requestIndex)
          )
            throw new Error('provider request before owned thread and turn correlation')
          return await scriptedRequest({
            ...input,
            context: {
              binarySha256: `sha256:${POLICY.executable.sha256}`,
              platform: `${POLICY.executable.platform}-${POLICY.executable.arch}`,
              configSha256: `sha256:${sha(JSON.stringify(activeConfigForProvider.config))}`,
              schemaSha256: `sha256:${POLICY.executable.schemaDigest}`,
              runId: prepared.manifestDigest,
              requestId: `${caseId}-listener-request-${input.requestIndex}`,
              threadId: observed.threadId,
              turnId: observed.turnId,
            },
          })
        },
        onCaptured: async (request, headerClasses) => {
          captureProof = await onCaptured(request, headerClasses)
          return captureProof
        },
        onProviderFailure,
        canonicalRequest: canonicalBridge.handle,
        auditRequest: () => {
          throw new Error('T3 scoped audit forbidden')
        },
      })
      let child = null
      let ownedObserver = null
      try {
        const config = prepareTrustedCase(prepared, caseId, {
          port: provider.port,
          mcpExecutable: interpreter.path,
          mcpArgs: [mcp.path, '--m02-ta-scoped-worker'],
        })
        activeConfigForProvider = config
        const script =
          typeof prepareScript === 'function'
            ? await prepareScript({
                caseId,
                canonicalBridge,
                provider,
                journal,
                config,
                getPeer: () => activePeerForProvider,
              })
            : null
        if (script) scriptedRequest = script.handle
        if (typeof scriptedRequest !== 'function') throw new Error('scripted provider route absent before child start')
        const bootstrapValue = canonicalBridge.bootstrapConfig(`http://127.0.0.1:${provider.port}/m02/canonical`)
        await ports.writeBootstrap({
          id: `${caseId}-bootstrap`,
          caseId,
          value: bootstrapValue,
        })
        if (typeof createObserver === 'function') {
          const observerFactory = await createObserver({
            caseId,
            spawnOwnedCodex: async () => {
              child = await ports.spawnCodex({ id: `${caseId}-codex`, caseId, cwd: config.cwd, env: config.env })
              return { child, stopOwned: () => ports.stopOwned({ child, server: provider.server }) }
            },
            allowedDirectChildPaths: [interpreter.path],
          })
          if (typeof observerFactory?.spawn !== 'function') throw new Error('owned host observer spawn gate missing')
          ownedObserver = await observerFactory.spawn()
          child = ownedObserver.child
          if (
            typeof ownedObserver?.assertLiveHostBeforeCaseComplete !== 'function' ||
            typeof ownedObserver?.stopAndVerify !== 'function'
          )
            throw new Error('owned host observer missing')
        } else {
          child = await ports.spawnCodex({ id: `${caseId}-codex`, caseId, cwd: config.cwd, env: config.env })
        }
        const peer = new TrustedMatrixAppServerPeer({
          coordinator,
          journal,
          caseId,
          verifyMcpStartup: verifyMcpStartupCase ?? verifyMcpStartup,
          verifyRequiredMcpFailure: verifyRequiredMcpFailureCase ?? verifyRequiredMcpFailure,
          verifyRequiredMcpTelemetry: verifyRequiredMcpTelemetryCase ?? verifyRequiredMcpTelemetry,
          verifyPermissionRequest: script?.verifyPermissionRequest ?? verifyPermissionRequest,
          verifyPermissionTerminal: script?.verifyPermissionTerminal ?? verifyPermissionTerminal,
          onFailure: recordFailure,
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
        activePeer = peer
        activePeerForProvider = peer
        if (!child.stdout?.on || !child.stderr?.on) throw new Error('owned stdio channels missing')
        const ownedExit = { exit: null, close: null }
        let ownedCloseResolve
        const ownedClosed = new Promise(resolve => {
          ownedCloseResolve = resolve
        })
        let pump = Promise.resolve()
        let stderrBytes = 0
        let terminalResolve
        let terminalReject
        let threadResolve
        let threadReject
        let settled = false
        let threadSettled = false
        const terminal = new Promise((resolve, reject) => {
          terminalResolve = resolve
          terminalReject = reject
        })
        const threadReady = new Promise((resolve, reject) => {
          threadResolve = resolve
          threadReject = reject
        })
        void terminal.catch(() => {})
        void threadReady.catch(() => {})
        const checkTerminal = () => {
          if (journal.snapshot().fenced) {
            if (!settled) {
              settled = true
              terminalReject(new Error('durable phase UNKNOWN'))
            }
            if (!threadSettled) {
              threadSettled = true
              threadReject(new Error('durable phase UNKNOWN'))
            }
            return
          }
          const phase = peer.snapshot().phase
          if (!threadSettled && peer.snapshot().threadId && ['thread', 'turn', 'terminal'].includes(phase)) {
            threadSettled = true
            threadResolve(peer.snapshot().threadId)
          }
          if (settled) return
          if (['terminal', 'required-mcp-failed', 'permission-denied'].includes(phase)) {
            settled = true
            terminalResolve(phase)
          }
        }
        const uncertain = async () => {
          await runtimeFailure('OWNED_CHILD_OR_STREAM_ERROR')
          if (!journal.snapshot().fenced) journal.markUnknown()
          checkTerminal()
        }
        child.stdout.on('data', bytes => {
          pump = pump
            .then(() => peer.feed(bytes))
            .then(checkTerminal)
            .catch(uncertain)
        })
        child.stdout.on('end', () => {
          pump = pump
            .then(() => peer.eof())
            .then(checkTerminal)
            .catch(uncertain)
        })
        child.stderr.on('data', bytes => {
          stderrBytes += bytes.length
          if (stderrBytes > 65536) uncertain()
        })
        child.on('error', uncertain)
        child.stdin.on?.('error', uncertain)
        child.on('exit', (code, signal) => {
          ownedExit.exit = { code, signal }
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
        child.on('close', (code, signal) => {
          ownedExit.close = { code, signal }
          ownedCloseResolve()
        })
        return Object.freeze({
          config,
          bootstrapProof: Object.freeze({
            capabilityHash: `sha256:${sha(bootstrapValue.capability)}`,
            bootstrapHash: `sha256:${sha(JSON.stringify(bootstrapValue))}`,
          }),
          child,
          provider,
          peer,
          coordinator,
          remainingCaseBudget: () => coordinator.remainingCaseBudget(),
          script,
          observer: ownedObserver,
          ownedExit: () => structuredClone(ownedExit),
          waitForOwnedClose: async () => {
            const timer = setTimeout(() => {
              ownedCloseResolve()
            }, 5000)
            timer.unref?.()
            try {
              await ownedClosed
            } finally {
              clearTimeout(timer)
            }
            if (!ownedExit.exit || !ownedExit.close) throw new Error('owned Codex exit or close unobserved')
            return structuredClone(ownedExit)
          },
          waitForThread: async () => {
            const timer = setTimeout(
              () => {
                void uncertain()
              },
              Math.min(30_000, await coordinator.remainingCaseBudget()),
            )
            timer.unref?.()
            try {
              return await threadReady
            } finally {
              clearTimeout(timer)
            }
          },
          waitForTerminal: async () => {
            const timer = setTimeout(
              () => {
                void uncertain()
              },
              await coordinator.remainingCaseBudget(),
            )
            timer.unref?.()
            try {
              return await terminal
            } finally {
              clearTimeout(timer)
            }
          },
          stopOwned: () => ports.stopOwned({ child, server: provider.server }),
        })
      } catch (error) {
        if (!journal.snapshot().fenced) journal.markUnknown('startup-uncertain')
        // startCase has not returned its owned handles yet. Cleanup must happen here.
        await ports.stopOwned({ ...(child ? { child } : {}), server: provider.server }).catch(() => {})
        if (ports.snapshot().ownedListeners)
          await ports.stopOwned({ child: null, server: provider.server }).catch(() => {})
        throw error
      }
    },
    snapshot: () => ({ ...ports.snapshot(), journal: journal.snapshot(), runtimeQualified: false }),
  })
}
