import {
  assertNativeQualificationLossSender,
  bindNativeQualificationLossParser,
  deferNativeQualificationLossPhysical,
  deferNativeQualificationLossDisconnect,
  failNativeQualificationLoss,
  nativeQualificationLossKind,
  inspectNativeQualificationLoss,
  captureNativeQualificationLossChildCleanup,
  retainNativeQualificationLossOperation,
  tightenNativeQualificationLossCleanup,
  waitNativeQualificationLossPhysicalRelease,
  withholdNativeQualificationStartReply,
  type NativeQualificationLossControl,
} from './native-qualification-loss'
import { mkdir, lstat, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpawnedProcess } from '../../process/task-spawner'
import { ownedProcessChildPid, spawnOwnedProcessGroup, stopOwnedProcessGroup } from '../../process/owned-process-stop'
import { observeNativeCodeModeHost } from './native-code-mode-host'
import {
  assertNativePublicInput,
  readNativePublicBytes,
  linkNativeCredential,
  unlinkNativeCredential,
  verifyNativeCredential,
} from './native-credential-topology'
import {
  nativeQualificationDigest,
  verifyNativeQualificationPlan,
  type CapturedNativeQualificationPlan,
} from './native-qualification-contract'
import { createNativeQualificationDrainGuard } from './native-qualification-drain'
import { createNativeQualificationProtocol } from './native-qualification-protocol'
import { captureNativeRequestSnapshot } from './native-request-snapshot'
import {
  nativeDiagnosticRequestStage,
  nativePassiveOutcomeStage,
  nativePassiveProtocolStage,
  requireNativeDiagnostic,
  type NativeDiagnosticObserver,
  type NativeDiagnosticStage,
} from './native-qualification-diagnostics'
import type { OwnedChildCleanupReceipt, OwnedFixtureChild } from './owned-child'
import { RpcTransport, type RpcTransportOptions, type RpcRequestMethod } from './rpc-transport'

export type NativeChildOutcomeObserver = Readonly<{
  closeStartup?(): void
  assertSendAdmission?(): void
  admitStartup?(): void
  validatedInitialize?(): void
  startupReady?(deadline: number, signal?: AbortSignal): Promise<void>
  beforeRequest(method: RpcRequestMethod, params: Record<string, unknown>): void
  operation(operation: Promise<unknown>, method: RpcRequestMethod | 'initialized'): void
  notification(method: string, params: Record<string, unknown>): void
  fault(): void
  cleanup(receipt: OwnedChildCleanupReceipt): void
}>
type OriginalNativeChild = {
  plan: CapturedNativeQualificationPlan
  transport: RpcTransport
  observer?: NativeChildOutcomeObserver
  diagnostics?: NativeDiagnosticObserver
  handoffPreclaim: (observer: NativeChildOutcomeObserver) => void
  closeStartup: () => void
}
const originalNativeChildren = new WeakMap<OwnedFixtureChild, OriginalNativeChild>()

/** Original factory domain only. Claim before initialize; serialized/fake children cannot bind. */
export function claimOriginalNativeQualificationChild(
  child: OwnedFixtureChild,
  plan: CapturedNativeQualificationPlan,
  observer: NativeChildOutcomeObserver,
) {
  const original = originalNativeChildren.get(child)
  requireNativeDiagnostic(original?.diagnostics, 'CHILD_CLAIM')
  if (
    !original ||
    original.plan !== plan ||
    original.observer ||
    original.transport.snapshot().issuedRequests !== 0 ||
    original.transport.snapshot().writtenBytes !== 0 ||
    original.transport.snapshot().status !== 'open'
  ) {
    original?.diagnostics?.record('CHILD_CLAIM', 'REFUSED', 'BOUNDARY_REFUSED')
    throw new Error('Original pre-handshake native child required')
  }
  original.observer = Object.freeze({ ...observer })
  try {
    original.handoffPreclaim(original.observer)
  } catch {
    original.transport.fence('native_outcome_capture_refused')
    original.observer.fault()
    original.diagnostics?.record('CHILD_CLAIM', 'REFUSED', 'BOUNDARY_REFUSED')
    throw new Error('Original pre-handshake native observation refused')
  }
  requireNativeDiagnostic(original.diagnostics, 'CHILD_CLAIM', 'ACCEPTED')
  return Object.freeze({
    owner: original.transport.owner,
    sealSender: () => {
      original.closeStartup()
      return original.transport.sealSender()
    },
    snapshot: () => original.transport.snapshot(),
    fence: () => {
      original.closeStartup()
      original.transport.fence('native_outcome_refused')
    },
  })
}

export function originalNativeQualificationLossOwner(child: OwnedFixtureChild, plan: CapturedNativeQualificationPlan) {
  const original = originalNativeChildren.get(child)
  if (!original || original.plan !== plan || !original.observer || original.transport.snapshot().issuedRequests !== 0)
    throw new Error('Original claimed pre-handshake child required')
  return original.transport.owner
}

function recordNativeAcquisitionRefusal(
  diagnostics: NativeDiagnosticObserver | undefined,
  stage: NativeDiagnosticStage,
  acquisitionTimedOut: boolean,
) {
  if (stage === 'ACQUISITION' && acquisitionTimedOut) {
    diagnostics?.record(stage, 'TIMED_OUT', 'ACQUISITION_DEADLINE')
    return
  }
  diagnostics?.record(stage, 'REFUSED', stage === 'ACQUISITION' ? 'OWNED_STARTUP_REFUSED' : 'BOUNDARY_REFUSED')
}
function verifyOriginalNativeChildPlan(
  plan: CapturedNativeQualificationPlan,
  diagnostics: NativeDiagnosticObserver | undefined,
) {
  try {
    requireNativeDiagnostic(diagnostics, 'PLAN_VERIFY')
    const captured = verifyNativeQualificationPlan(plan)
    const protocol = createNativeQualificationProtocol({
      serverName: captured.manifest.endpoint.serverName,
      enabledTools: captured.manifest.enabledTools,
      maxToolCalls: captured.manifest.limits.toolCalls,
    })
    requireNativeDiagnostic(diagnostics, 'PLAN_VERIFY', 'ACCEPTED')
    return { ...captured, protocol }
  } catch {
    diagnostics?.record('PLAN_VERIFY', 'REFUSED', 'BOUNDARY_REFUSED')
    throw new Error('Native qualification plan refused')
  }
}

/** This sender is deliberately unregistered. It creates no native-effect allowance. */
export async function launchNativeQualificationChild(
  plan: CapturedNativeQualificationPlan,
  callbacks: Pick<RpcTransportOptions, 'onNotification' | 'onFault'> & {
    transportId: string
    assertAdmission: () => void
    fenceMcp: () => void
    closeMcp: () => Promise<boolean>
    captureOriginalDisconnect?: (disconnect: () => boolean) => void
    diagnostics?: NativeDiagnosticObserver
    qualificationLoss?: NativeQualificationLossControl
  },
): Promise<OwnedFixtureChild> {
  const boundCallbacks = Object.freeze({ ...callbacks })
  const diagnostics = boundCallbacks.diagnostics
  const loss = boundCallbacks.qualificationLoss
  function expectedWithheldStart(method: RpcRequestMethod | 'initialized') {
    if (!loss || method !== 'turn/start' || nativeQualificationLossKind(loss) !== 'R2_NATIVE_START_ACK_LOSS')
      return false
    const proof = inspectNativeQualificationLoss(loss).proof
    return proof.VALIDATED && proof.WITHHELD && !proof.UNPROVEN
  }
  const { manifest, config, protocol } = verifyOriginalNativeChildPlan(plan, diagnostics)
  const root = manifest.freshRoot
  const caseDeadline = Date.now() + manifest.limits.caseMs
  let startupDeadline: number | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let startupSignal: AbortSignal | undefined
  let wireRequest: { method: RpcRequestMethod | 'initialized'; deadline: number; signal?: AbortSignal } | undefined
  let requestActive = false
  function assertWireTime() {
    if (
      !wireRequest ||
      !Number.isSafeInteger(wireRequest.deadline) ||
      Date.now() >= wireRequest.deadline ||
      wireRequest.signal?.aborted
    )
      throw new Error('Native request entry budget expired')
    assertStartupTime(wireRequest.method)
  }
  function assertStartupTime(method: RpcRequestMethod | 'initialized') {
    if (
      method === 'thread/start' &&
      originalChild?.observer?.startupReady &&
      (!startupDeadline || Date.now() >= startupDeadline || startupSignal?.aborted)
    )
      throw new Error('Native startup admission expired')
  }
  function assertWireAdmission() {
    assertNativeQualificationLossSender(loss)
    boundCallbacks.assertAdmission()
    originalChild?.observer?.assertSendAdmission?.()
    // No caller code follows these final clock/signal checks.
    assertNativeQualificationLossSender(loss)
    assertWireTime()
  }
  const startupExpired = () => {
    closeStartup()
    originalChild?.observer?.fault()
    transport?.fence('native_startup_expired')
  }
  function closeStartup() {
    if (startupTimer) clearTimeout(startupTimer)
    startupTimer = undefined
    startupSignal?.removeEventListener('abort', startupExpired)
    originalChild?.observer?.closeStartup?.()
  }
  let originalRoot: Awaited<ReturnType<typeof lstat>> | undefined
  let stage: NativeDiagnosticStage = 'ROOT_CREATE'
  let link: ReturnType<typeof linkNativeCredential> | undefined
  let owned: SpawnedProcess | undefined
  let transport: RpcTransport | undefined
  let originalChild: OriginalNativeChild | undefined
  let registeredChild: OwnedFixtureChild | undefined
  const preclaimFrames: Array<{ method: string; params: Record<string, unknown> }> = []
  let preclaimBytes = 0,
    preclaimPoison = false,
    passiveRefusalRecorded = false
  let acquisitionEntered = false,
    acquisitionTimedOut = false,
    abandoned = false
  let mcpFenceEntered = false,
    mcpFenceFailed = false
  let drain: ReturnType<typeof createNativeQualificationDrainGuard> | undefined
  let hostObservation: ReturnType<typeof observeNativeCodeModeHost> | undefined
  let stopFlight: Promise<OwnedChildCleanupReceipt> | undefined
  function fenceNative() {
    closeStartup()
    preclaimPoison = true
    preclaimFrames.length = 0
    transport?.fence('native_owned_stop')
    if (mcpFenceEntered) return
    mcpFenceEntered = true
    try {
      boundCallbacks.fenceMcp()
    } catch {
      mcpFenceFailed = true
    }
  }
  function recordPassiveRefusal(
    stage: NativeDiagnosticStage,
    reason: 'PROTOCOL_REFUSED' | 'OUTCOME_OBSERVER_REFUSED' | 'STREAM_PARSE_OR_IO_REFUSED' | 'PRECLAIM_CAPTURE_LIMIT',
    notificationSchemaBranch?: number,
  ) {
    if (passiveRefusalRecorded) return
    passiveRefusalRecorded = true
    diagnostics?.record(stage, 'REFUSED', reason, notificationSchemaBranch)
  }
  function observeOriginalNotification(
    observer: NativeChildOutcomeObserver,
    method: string,
    params: Record<string, unknown>,
  ) {
    try {
      observer.notification(method, params)
    } catch (error) {
      const stage = nativePassiveOutcomeStage(method)
      recordPassiveRefusal(
        stage,
        'OUTCOME_OBSERVER_REFUSED',
        stage === 'PASSIVE_OUTCOME_OTHER' ? protocol.notificationSchemaBranch(method) : undefined,
      )
      throw error
    }
  }
  function observePassiveFrame(value: unknown) {
    try {
      if (protocol.passiveFrame(value) === 'INITIALIZE_VALIDATED') {
        // Diagnostic-only children do not gain a startup-metadata acceptance capability.
        originalChild?.observer?.validatedInitialize?.()
      }
    } catch (error) {
      recordPassiveRefusal(nativePassiveProtocolStage(value), 'PROTOCOL_REFUSED')
      throw error
    }
    const frame = value as { method?: string; params?: Record<string, unknown> }
    if (frame.method && frame.params) {
      if (originalChild?.observer) observeOriginalNotification(originalChild.observer, frame.method, frame.params)
      else capturePreclaim(frame.method, frame.params, value)
    }
  }
  function capturePreclaim(method: string, params: Record<string, unknown>, value: unknown) {
    if (preclaimPoison) return
    preclaimBytes += Buffer.byteLength(JSON.stringify(value))
    if (preclaimFrames.length >= 32 || preclaimBytes > 256 * 1024) {
      preclaimPoison = true
      preclaimFrames.length = 0
      recordPassiveRefusal('PASSIVE_PRECLAIM', 'PRECLAIM_CAPTURE_LIMIT')
    } else preclaimFrames.push({ method, params })
  }
  function originalAcquired(original: SpawnedProcess) {
    owned = original
    if (manifest.codeMode) {
      try {
        const childPid = ownedProcessChildPid(original)
        if (!childPid || !original.pid) throw new Error('Original Code Mode process metadata unavailable')
        hostObservation = observeNativeCodeModeHost(
          childPid,
          original.pid,
          manifest.codeMode.host.path,
          manifest.codeMode.observer.path,
        )
      } catch {
        preclaimPoison = true
        abandoned = true
      }
    }
    const { stdout, stderr } = original.process
    if (stdout && stderr)
      drain = createNativeQualificationDrainGuard(stdout, stderr, observePassiveFrame, () => {
        recordPassiveRefusal('PASSIVE_STREAM', 'STREAM_PARSE_OR_IO_REFUSED')
        preclaimPoison = true
        closeStartup()
        transport?.fence('native_passive_drain_refused')
        originalChild?.observer?.fault()
        diagnostics?.record('STREAM_CAPTURE', 'UNKNOWN', 'PASSIVE_CAPTURE_REFUSED')
        boundCallbacks.onFault('native_passive_drain_refused')
      })
    const disconnect = () => {
      if (!original.process.connected) return false
      try {
        original.process.disconnect()
        return true
      } catch {
        return false
      }
    }
    boundCallbacks.captureOriginalDisconnect?.(() =>
      loss ? deferNativeQualificationLossDisconnect(loss, disconnect) : disconnect(),
    )
    if (abandoned) {
      stdout?.resume()
      stderr?.resume()
      void stopOnce()
    }
  }
  function uncertain(groupExitObserved: boolean): OwnedChildCleanupReceipt {
    return Object.freeze({
      status: 'uncertain',
      groupExitObserved,
      privateRootRemoved: false,
      privateRootRetained: true,
      reason: 'owned_drain_unverified',
    })
  }
  async function boundedAcquisition(original: Promise<SpawnedProcess>) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        original,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abandoned = true
            acquisitionTimedOut = true
            reject(new Error('Native acquisition deadline'))
          }, manifest.limits.acquisitionMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  async function removeRoot() {
    const current = await lstat(root, { bigint: true })
    if (
      !originalRoot ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== originalRoot.dev ||
      current.ino !== originalRoot.ino
    )
      throw new Error('Native private root identity changed')
    await rm(root, { recursive: true })
  }
  function stopOnce(): Promise<OwnedChildCleanupReceipt> {
    if (!stopFlight) {
      if (loss) tightenNativeQualificationLossCleanup(loss, Date.now() + manifest.limits.cleanupMs)
      // Reserve the one flight before cleanup can synchronously notify a failing sink.
      stopFlight = Promise.resolve().then(cleanup)
      if (loss && registeredChild) {
        try {
          captureNativeQualificationLossChildCleanup(loss, registeredChild, stopFlight)
        } catch {
          failNativeQualificationLoss(loss)
        } // startup failure may precede runtime binding; original cleanup still runs
      }
      void stopFlight.then(
        receipt => originalChild?.observer?.cleanup(receipt),
        () => originalChild?.observer?.fault(),
      )
    }
    return stopFlight
  }
  async function cleanup(): Promise<OwnedChildCleanupReceipt> {
    const cleanupExpiresAt = loss
      ? inspectNativeQualificationLoss(loss).cleanupDeadline
      : Date.now() + manifest.limits.cleanupMs
    diagnostics?.record('CLEANUP', 'ENTERED')
    let groupExitObserved = false,
      expired = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function observeOriginalGroup() {
      const original = owned
      if (original) {
        await stopOwnedProcessGroup(original)
        groupExitObserved = true
      } else if (acquisitionEntered) throw new Error('Original acquisition unavailable')
    }
    function cleanupExpired() {
      return expired || (loss && Date.now() >= cleanupExpiresAt)
    }
    async function waitOriginalDrain() {
      if (!drain) return true
      return drain.wait(loss ? Math.max(0, cleanupExpiresAt - Date.now()) : manifest.limits.cleanupMs)
    }
    async function closeOriginalServices() {
      if (cleanupExpired() || mcpFenceFailed) return false
      if (!(await boundCallbacks.closeMcp())) return false
      return waitOriginalDrain()
    }
    async function originalCleanup(): Promise<OwnedChildCleanupReceipt> {
      try {
        fenceNative()
        if (loss) await waitNativeQualificationLossPhysicalRelease(loss)
        await observeOriginalGroup()
        if (!(await closeOriginalServices())) return uncertain(groupExitObserved)
        if (manifest.codeMode && !(await hostObservation?.verifyGone(cleanupExpiresAt)))
          return uncertain(groupExitObserved)
        if (cleanupExpired()) return uncertain(groupExitObserved)
        verifyNativeCredential(manifest.credentialSource)
        if (link) unlinkNativeCredential(link)
        await removeRoot()
        return Object.freeze({
          status: 'stopped',
          groupExitObserved,
          privateRootRemoved: true,
          privateRootRetained: false,
        })
      } catch {
        return uncertain(groupExitObserved)
      }
    }
    try {
      const original = originalCleanup()
      if (loss) retainNativeQualificationLossOperation(loss, original)
      const receipt = await Promise.race([
        original,
        new Promise<OwnedChildCleanupReceipt>(resolve => {
          timer = setTimeout(
            () => {
              expired = true
              if (loss) failNativeQualificationLoss(loss)
              resolve(uncertain(groupExitObserved))
            },
            loss ? Math.max(0, cleanupExpiresAt - Date.now()) : manifest.limits.cleanupMs,
          )
        }),
      ])
      diagnostics?.record(
        'CLEANUP',
        receipt.status === 'stopped' ? 'SETTLED' : 'UNKNOWN',
        receipt.status === 'stopped' ? 'NONE' : 'CLEANUP_UNCERTAIN',
      )
      return receipt
    } finally {
      if (timer) clearTimeout(timer)
      hostObservation?.close()
    }
  }
  diagnostics?.onFailure(() => {
    if (loss) failNativeQualificationLoss(loss)
    abandoned = true
    fenceNative()
    // Existing original cleanup owns every physical action, including late acquisition.
    queueMicrotask(() => {
      if (!acquisitionEntered || owned) void stopOnce()
    })
  })
  try {
    requireNativeDiagnostic(diagnostics, stage)
    // Exclusive creation refuses every preexisting root, including prior uncertain attempts.
    await mkdir(root, { mode: 0o700 })
    originalRoot = await lstat(root, { bigint: true })
    requireNativeDiagnostic(diagnostics, stage, 'SETTLED')
    stage = 'PRIVATE_CONFIG'
    requireNativeDiagnostic(diagnostics, stage)
    const home = path.join(root, 'home'),
      codexHome = path.join(root, 'codex-home'),
      temporary = path.join(root, 'tmp'),
      cwd = path.join(root, 'cwd')
    for (const directory of [home, codexHome, temporary, cwd]) await mkdir(directory, { mode: 0o700 })
    await writeFile(path.join(codexHome, 'config.toml'), config, { flag: 'wx', mode: 0o600 })
    link = linkNativeCredential(manifest.credentialSource, path.join(codexHome, 'auth.json'))
    verifyNativeQualificationPlan(plan)
    boundCallbacks.assertAdmission()
    const configPath = path.join(codexHome, 'config.toml')
    assertNativePublicInput(configPath, manifest.credentialSource)
    if (
      nativeQualificationDigest(readNativePublicBytes(configPath, manifest.credentialSource, 1024 * 1024)) !==
      `sha256:${manifest.configurationSha256}`
    )
      throw new Error('Native private config drift')
    requireNativeDiagnostic(diagnostics, stage, 'ACCEPTED')
    stage = 'ACQUISITION'
    requireNativeDiagnostic(diagnostics, stage)
    if (abandoned) throw new Error('Native acquisition fenced')
    acquisitionEntered = true
    // Default acquisition uses the original owned process-group capability, never a fake port or PATH lookup.
    const originalAcquisition = spawnOwnedProcessGroup(manifest.native.path, ['app-server'], {
      supervisorPath: path.join(manifest.repositoryRoot, 'scripts/owned-process-supervisor.mjs'),
      cwd,
      env: { HOME: home, CODEX_HOME: codexHome, TMPDIR: temporary, LANG: 'C.UTF-8' },
      streamLogs: false,
      captureOutput: false,
      retainProcessRecord: false,
      privateStdio: true,
    })
    void originalAcquisition.then(originalAcquired, () => {})
    owned = await boundedAcquisition(originalAcquisition)
    requireNativeDiagnostic(diagnostics, stage, 'SETTLED')
    if (abandoned) throw new Error('Native acquisition fenced')
    stage = 'STREAM_CAPTURE'
    requireNativeDiagnostic(diagnostics, stage)
    const { stdin, stdout, stderr } = owned.process
    if (!stdin || !stdout || !stderr || !drain) throw new Error('Native private streams unavailable')
    requireNativeDiagnostic(diagnostics, stage, 'ACCEPTED')
    stage = 'RPC_TRANSPORT'
    requireNativeDiagnostic(diagnostics, stage)
    transport = new RpcTransport(
      { stdin, stdout, stderr },
      {
        ...boundCallbacks,
        requestTimeoutMs: manifest.limits.requestMs,
        retainReadStreamsOnFence: true,
        onFault(reason) {
          preclaimPoison = true
          closeStartup()
          diagnostics?.record('RPC_TRANSPORT', 'UNKNOWN', 'CHILD_FAULT')
          try {
            originalChild?.observer?.fault()
          } finally {
            boundCallbacks.onFault(reason)
          }
        },
        onNotification(method, params) {
          try {
            protocol.notification(method, params)
            boundCallbacks.onNotification(method, params)
          } catch {
            originalChild?.observer?.fault()
            transport?.fence('native_protocol_refused')
            boundCallbacks.onFault('native_protocol_refused')
          }
        },
      },
      {
        assertAdmission: assertWireAdmission,
        allocated() {},
        notEmitted() {},
        attempted() {},
        ...(loss
          ? {
              written(metadata: Readonly<{ requestId: number; method: RpcRequestMethod }>) {
                protocol.written(metadata.requestId, metadata.method)
              },
              beforeReply(metadata: Readonly<{ requestId: number; method: RpcRequestMethod }>) {
                protocol.assertHealthy()
                if (
                  nativeQualificationLossKind(loss) === 'R2_NATIVE_START_ACK_LOSS' &&
                  metadata.method === 'turn/start'
                ) {
                  withholdNativeQualificationStartReply(loss, originalTransport.owner, metadata.requestId)
                  return false
                }
                return true
              },
              replyRefused() {
                /* fixed proof is retained by the original loss controller, never inferred from errors */
              },
              deferPhysical(action: () => void) {
                deferNativeQualificationLossPhysical(loss, action)
              },
            }
          : {}),
        beforeWrite() {
          assertWireAdmission()
          if (wireRequest?.method === 'thread/start') {
            originalChild?.observer?.admitStartup?.()
            closeStartup()
          }
          boundCallbacks.assertAdmission()
          // Keep absolute deadlines/signals after closing the timer and window.
          assertWireTime()
        },
      },
    )
    requireNativeDiagnostic(diagnostics, stage, 'SETTLED')
    const originalTransport = transport
    const processFault = () => {
      if (originalTransport.snapshot().status === 'fenced') return
      diagnostics?.record('RPC_TRANSPORT', 'UNKNOWN', 'CHILD_FAULT')
      originalTransport.fence('native_child_exit')
      originalChild?.observer?.fault()
      boundCallbacks.onFault('native_child_exit')
    }
    owned.process.once('error', processFault)
    owned.process.once('exit', processFault)
    originalChild = {
      plan,
      diagnostics,
      transport: originalTransport,
      closeStartup,
      handoffPreclaim(observer) {
        if (preclaimPoison) throw new Error('Incomplete native preclaim observation')
        // Original parsed frame objects only: no serialized evidence is imported or replayed as authority.
        for (const frame of preclaimFrames.splice(0)) observeOriginalNotification(observer, frame.method, frame.params)
      },
    }
    const protocolTransport = protocol.transport(
      Object.freeze({
        request(method: RpcRequestMethod, params: Record<string, unknown>, timeoutMs?: number, signal?: AbortSignal) {
          originalChild?.observer?.beforeRequest(method, params)
          assertWireAdmission()
          const operation = originalTransport.request(method, params, timeoutMs, signal)
          originalChild?.observer?.operation(operation, method)
          return operation
        },
        notifyInitialized() {
          const operation = originalTransport.notifyInitialized()
          originalChild?.observer?.operation(operation, 'initialized')
          return operation
        },
        fence(reason: string) {
          closeStartup()
          originalTransport.fence(reason)
        },
        snapshot: transport.snapshot.bind(transport),
      }),
    )
    function observedOperation<T>(method: RpcRequestMethod | 'initialized', operation: () => Promise<T>): Promise<T> {
      const requestStage = nativeDiagnosticRequestStage(method)
      requireNativeDiagnostic(diagnostics, requestStage)
      let original: Promise<T>
      try {
        original = operation()
      } catch (error) {
        closeStartup()
        if (!expectedWithheldStart(method)) originalChild?.observer?.fault()
        originalTransport.fence('native_protocol_request_refused')
        diagnostics?.record(requestStage, 'REFUSED', 'REQUEST_REJECTED')
        throw error
      }
      void original.then(
        () => {
          diagnostics?.record(requestStage, 'SETTLED')
        },
        () => {
          closeStartup()
          if (!expectedWithheldStart(method)) originalChild?.observer?.fault()
          originalTransport.fence('native_protocol_request_refused')
          diagnostics?.record(requestStage, 'REFUSED', 'REQUEST_REJECTED')
        },
      )
      return original
    }
    function beginInitialization(method: RpcRequestMethod, deadline: number, signal?: AbortSignal) {
      if (method !== 'initialize') return
      startupDeadline = deadline
      startupSignal = signal
      if (originalChild?.observer?.startupReady) {
        startupTimer = setTimeout(startupExpired, Math.max(0, startupDeadline - Date.now()))
        startupSignal?.addEventListener('abort', startupExpired, { once: true })
        if (startupSignal?.aborted) startupExpired()
      }
    }
    function snapshotRequest(params: Record<string, unknown>, deadline: number, signal?: AbortSignal) {
      const snapshot = captureNativeRequestSnapshot(params)
      if (Date.now() >= deadline || signal?.aborted) throw new Error('Native request entry budget expired')
      return snapshot
    }
    const child: OwnedFixtureChild = Object.freeze({
      transportId: boundCallbacks.transportId,
      transport: Object.freeze({
        request(method: RpcRequestMethod, params: Record<string, unknown>, timeoutMs?: number, signal?: AbortSignal) {
          const entered = Date.now()
          const requestDeadline = Math.min(
            caseDeadline,
            entered + Math.min(timeoutMs ?? manifest.limits.requestMs, manifest.limits.requestMs),
          )
          return observedOperation(method, async () => {
            if (requestActive) throw new Error('Native request already active')
            requestActive = true
            try {
              beginInitialization(method, requestDeadline, signal)
              const snapshot = snapshotRequest(params, requestDeadline, signal)
              // Waiting occurs before the protocol or raw transport can register an unsent reply ID.
              if (method === 'thread/start' && originalChild?.observer?.startupReady) {
                if (!startupDeadline) throw new Error('Native startup deadline unavailable')
                await originalChild.observer.startupReady(Math.min(startupDeadline, requestDeadline), signal)
                verifyNativeQualificationPlan(plan)
              }
              wireRequest = { method, deadline: requestDeadline, signal }
              let operation: Promise<unknown>
              try {
                assertWireAdmission()
                operation = protocolTransport.request(method, snapshot, requestDeadline - Date.now(), signal)
              } finally {
                // Every raw write is synchronous; no scheduled continuation retains this capability.
                wireRequest = undefined
              }
              return await operation
            } catch {
              closeStartup()
              if (!expectedWithheldStart(method)) originalChild?.observer?.fault()
              originalTransport.fence('native_startup_or_request_refused')
              throw new Error('Native original request refused')
            } finally {
              requestActive = false
            }
          })
        },
        notifyInitialized() {
          const entered = Date.now()
          return observedOperation('initialized', () => {
            wireRequest = {
              method: 'initialized',
              deadline: Math.min(caseDeadline, entered + manifest.limits.requestMs),
              signal: startupSignal,
            }
            try {
              assertWireAdmission()
              return protocolTransport.notifyInitialized()
            } finally {
              wireRequest = undefined
            }
          })
        },
        fence: protocolTransport.fence,
        snapshot: protocolTransport.snapshot,
      }),
      stop() {
        fenceNative()
        return stopOnce()
      },
    })
    stage = 'CHILD_REGISTER'
    requireNativeDiagnostic(diagnostics, stage)
    registeredChild = child
    originalNativeChildren.set(child, originalChild)
    if (loss) bindNativeQualificationLossParser(loss, originalTransport.owner, protocol.consumeTurnStartReceipt)
    requireNativeDiagnostic(diagnostics, stage, 'SETTLED')
    return child
  } catch {
    recordNativeAcquisitionRefusal(diagnostics, stage, acquisitionTimedOut)
    originalChild?.observer?.fault()
    transport?.fence('native_launch_failed')
    abandoned = true
    const cleaned = acquisitionEntered && !owned ? uncertain(false) : await stopOnce()
    throw new Error(
      cleaned.privateRootRetained
        ? 'Native acquisition failed; private root retained UNKNOWN'
        : 'Native acquisition refused',
    )
  }
}
