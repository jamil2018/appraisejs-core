import { randomUUID } from 'node:crypto'
import { inspectNativeQualificationLoss, type NativeQualificationLossControl } from './native-qualification-loss'
import { NativeStartupMetadata, nativeStartupWarning } from './native-startup-metadata'
import { nativeQualificationModel } from './native-qualification-configuration'
import type { PrismaClient } from '@prisma/client'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import {
  requireNativeDiagnostic,
  nativePassiveOutcomeStage,
  type NativeSourceNotificationRefusal,
  type NativeDiagnosticObserver,
  type NativeDiagnosticStage,
} from './native-qualification-diagnostics'
import { claimOriginalNativeQualificationChild } from './native-qualification-child'
import type { OwnedFixtureChild } from './owned-child'
import {
  inspectNativeOutcomeProfile,
  nativeOutcomeProtocolDigest,
  nativeOutcomeReviewControlDigest,
  type NativeOutcomeProfile,
} from './native-outcome-profile'
import { inspectNativeQualificationPlan } from './native-qualification-contract'
import { verifyNativeQualificationConfiguration } from './native-qualification-configuration'
import { NativeOutcomeJournal } from './native-outcome-journal'
import { inspectRpcTransportOwner, type RpcRequestMethod, type RpcTransport } from './rpc-transport'
import {
  assertProviderSendPermitOwned,
  bindProviderSendPermitTransport,
  inspectProviderSenderExcluded,
  sealConsumedProviderSender,
  type ProviderSendPermit,
  type ProviderSenderExcluded,
  type ProviderReconciliationIdentity,
} from '../provider-intent-contract'
import {
  acquireProviderSourceDatabaseHold,
  assertProviderSourceDatabaseClient,
  assertProviderSourceNativeConnectionDomain,
  assertProviderSourceTransactionSettingsForClient,
  proveProviderSourceNativeConnectionDomain,
  resolveProviderSourceDatabaseHold,
  type ProviderSourceDatabase,
  type ProviderSourceNativeConnectionDomain,
} from '../provider-source-database'
import {
  validateProviderReconciliationRecord,
  providerReconciliationRequestHash,
  type ProviderPhysicalOutcomeSource,
  type ProviderPhysicalOutcomeRecord,
  type ProviderReconciliationReceipt,
  type ProviderReconciliationContext,
} from '../provider-reconciliation-contract'
import type { SqliteOutcomeCustody } from './outcome-source'
import { readNativeOutcomeCommittedReplay, type NativeOutcomeReplay } from './native-outcome-replay'

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
// Pinned ThreadId::new generates v7; retain the previously admitted v4 native representation.
// Review nonces and domain identities continue using their separate v4 contracts.
const nativeThreadUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[47][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const warningRefusalPrefixes = [
  ['Falling back from WebSockets to HTTPS transport.', 'WARNING_TRANSPORT_FALLBACK'],
  [
    `Model metadata for \`${nativeQualificationModel}\` not found. Defaulting to fallback metadata;`,
    'WARNING_MODEL_METADATA_FALLBACK',
  ],
  ['Code Mode is unavailable because ', 'WARNING_CODE_MODE_UNAVAILABLE'],
  ['Code Mode is enabled in configuration, but model ', 'WARNING_CODE_MODE_UNSUPPORTED'],
  [
    'Agent message-board initialization failed; its tools are unavailable for this runtime.',
    'WARNING_THREAD_BOARD_INITIALIZATION',
  ],
  [
    'Failed to save the conversation transcript; Codex will continue retrying. Error: ',
    'WARNING_TRANSCRIPT_SAVE_FAILED',
  ],
] as const

function warningRefusal(message: unknown): NativeSourceNotificationRefusal {
  if (typeof message !== 'string') return 'WARNING_OTHER'
  return warningRefusalPrefixes.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'WARNING_OTHER'
}
const sources = new WeakMap<ProviderPhysicalOutcomeSource, OriginalNativeOutcome>()
const requestSequence = ['initialize', 'config/read', 'thread/start', 'mcpServerStatus/list', 'turn/start'] as const
export type NativeOutcomeReviewControl = Readonly<{
  reviewerId: string
  nonce: string
  reviewMs: number
  reconciliationMs: number
}>
export type NativeOutcomeReviewDecision = Readonly<{
  version: 'M13_NATIVE_OUTCOME_REVIEW_V1'
  decision: 'ACCEPT' | 'REVISE'
  reviewerId: string
  nonce: string
  candidateDigest: string
  dossierDigest: string
  profileDigest: string
  artifactDigest: string
  identityDigest: string
  actualReviewReceiptDigest: string
}>
export type NativeOutcomeCandidateOptions = Readonly<{
  profile: NativeOutcomeProfile
  permit: ProviderSendPermit
  database: ProviderSourceDatabase
  providerNamespace: string
  transportId: string
  reviewControl: NativeOutcomeReviewControl
  diagnostics?: NativeDiagnosticObserver
  qualificationLoss?: NativeQualificationLossControl
}>
function fail(): never {
  throw new Error('Original native outcome remains unreconciled UNKNOWN')
}

type Operation = { promise: Promise<unknown>; observation: Promise<void>; settled: boolean }
/** This original owner survives cleanup for the finite task-control review; it never schedules native effects. */
class OriginalNativeOutcome {
  readonly sourceId = `native_outcome_${randomUUID()}`
  readonly sourceIncarnation = randomUUID()
  readonly profile
  readonly initialIdentity
  readonly journal
  readonly scope
  #domain?: ProviderSourceNativeConnectionDomain
  #child?: ReturnType<typeof claimOriginalNativeQualificationChild>
  #operations: Operation[] = []
  #gateway: Operation[] = []
  #supervisor: Operation[] = []
  #sdkCleanup: Operation[] = []
  #supervisorStop: Operation[] = []
  #sdkCloseCaptured = false
  #startup = new NativeStartupMetadata()
  #poison = false
  #passivePoison = false
  #cleaned = false
  #sdkClosed = false
  #requests = 0
  #initialized = false
  #threadId?: string
  #turnId?: string
  #threadStarted = false
  #threadStartupWarningSeen = false
  #turnStarted = false
  #completion = 0
  #notificationCount = 0
  #notificationRefusalRecorded = false
  #remoteDisabled = 0
  #sender?: ProviderSenderExcluded
  #freezeEntered = false
  #candidate?: Readonly<Record<string, unknown>>
  #candidateDigest?: string
  #reviewDeadline?: number
  #decisionEntered = false
  #enrolled = false
  #revoked = false
  #proof?: object
  #physical?: ProviderPhysicalOutcomeRecord
  #source?: ProviderPhysicalOutcomeSource
  #reconciliationEntered = false
  #replay?: {
    key: string
    hash: string
    receipt: ProviderReconciliationReceipt
    hold: ReturnType<typeof acquireProviderSourceDatabaseHold>
    operation?: Promise<unknown>
    lookup: boolean
    result?: NativeOutcomeReplay
    completed: boolean
    retired: boolean
  }
  constructor(readonly options: NativeOutcomeCandidateOptions) {
    this.profile = inspectNativeOutcomeProfile(options.profile)
    assertProviderSendPermitOwned(options.permit)
    const control = Object.freeze({ ...options.reviewControl })
    if (this.profile.reviewControlDigest !== nativeOutcomeReviewControlDigest(control)) fail()
    if (
      !/^[A-Za-z0-9_.:/-]{1,200}$/.test(control.reviewerId) ||
      !uuid(control.nonce) ||
      ![control.reviewMs, control.reconciliationMs].every(ms => Number.isSafeInteger(ms) && ms >= 1 && ms <= 300_000)
    )
      fail()
    this.options = Object.freeze({ ...options, reviewControl: control })
    options.diagnostics?.onFailure(() => {
      this.#poisonSource()
    })
    this.initialIdentity = Object.freeze({
      runId: options.permit.runId,
      intentId: options.permit.intentId,
      sendBoundaryId: options.permit.sendBoundaryId,
      claimEpoch: options.permit.claimEpoch,
      providerNamespace: options.providerNamespace,
      configurationDigest: this.profile.configurationDigest,
      transportId: options.transportId,
      transportIncarnation: null,
      threadId: null,
      turnId: null,
    })
    this.scope = Object.freeze({
      sourceId: this.sourceId,
      sourceIncarnation: this.sourceIncarnation,
      providerRunId: options.permit.runId,
      intentId: options.permit.intentId,
      providerNamespace: options.providerNamespace,
    })
    this.journal = new NativeOutcomeJournal({
      database: options.database,
      sourceId: this.sourceId,
      sourceIncarnation: this.sourceIncarnation,
      identity: this.initialIdentity,
      protocolDigest: nativeOutcomeProtocolDigest,
      qualificationDigest: this.profile.profileDigest,
    })
  }
  async initialize() {
    await this.journal.initialize()
    this.#domain = await proveProviderSourceNativeConnectionDomain(this.options.database, this.scope)
  }
  #poisonSource() {
    this.#poison = true
    this.#startup.close()
    this.#child?.fence()
  }
  #healthy() {
    if (this.#poison || this.#revoked) fail()
    // The task freezes reviewed source/dependencies between startup verification and candidate sealing.
    // Admission stays synchronous and local; full byte verification belongs at the authority barriers below.
    if (!this.#domain) fail()
    assertProviderSourceNativeConnectionDomain(this.#domain, this.options.database, this.scope)
  }
  #operationLimit(list: Operation[]) {
    if (list === this.#operations) return 6
    if (list === this.#gateway) return 16
    if (list === this.#sdkCleanup || list === this.#supervisorStop) return 1
    return 64
  }
  #observe(promise: Promise<unknown>, list: Operation[], fulfilled?: (result: unknown) => void) {
    const maximum = this.#operationLimit(list)
    if (
      list.length >= maximum ||
      !(promise instanceof Promise) ||
      list.some(item => item.promise === promise) ||
      this.#cleaned
    ) {
      this.#poisonSource()
      fail()
    }
    const operation = { promise, observation: undefined as unknown as Promise<void>, settled: false }
    operation.observation = promise
      .then(
        value => {
          try {
            if (this.#cleaned && list !== this.#supervisorStop) this.#poisonSource()
            fulfilled?.(value)
          } catch {
            this.#poisonSource()
          }
        },
        () => {
          this.#poisonSource()
        },
      )
      .then(() => {
        operation.settled = true
      })
    list.push(operation)
  }
  attach(child: OwnedFixtureChild) {
    const diagnostics = this.options.diagnostics
    let stage: NativeDiagnosticStage = 'OUTCOME_ATTACH'
    try {
      requireNativeDiagnostic(diagnostics, stage)
      this.#healthy()
      if (this.#child) fail()
      this.#child = claimOriginalNativeQualificationChild(child, this.profile.plan, {
        closeStartup: () => this.#startup.close(),
        assertSendAdmission: () => {
          this.#healthy()
          assertProviderSendPermitOwned(this.options.permit)
        },
        admitStartup: () => this.#startup.admit(),
        validatedInitialize: () => this.#startup.validatedInitialize(),
        startupReady: async (deadline, signal) => {
          try {
            this.#healthy()
            assertProviderSendPermitOwned(this.options.permit)
            await this.#startup.wait(deadline, signal)
            this.#healthy()
            assertProviderSendPermitOwned(this.options.permit)
          } catch {
            this.#poisonSource()
            fail()
          }
        },
        beforeRequest: (method, params) => this.#beforeRequest(method, params),
        operation: (promise, method) => this.#observe(promise, this.#operations, value => this.#reply(method, value)),
        notification: (method, params) => this.#notification(method, params),
        fault: () => {
          this.#passivePoison = true
          this.#poisonSource()
        },
        cleanup: receipt => {
          if (
            this.#cleaned ||
            receipt.status !== 'stopped' ||
            !receipt.groupExitObserved ||
            !receipt.privateRootRemoved
          )
            this.#poisonSource()
          this.#startup.close()
          this.#cleaned = true
        },
      })
      stage = 'OWNER_MATCH'
      requireNativeDiagnostic(diagnostics, stage)
      if (inspectRpcTransportOwner(this.#child.owner).transportId !== this.options.transportId) fail()
      requireNativeDiagnostic(diagnostics, stage, 'ACCEPTED')
      stage = 'PERMIT_BIND'
      requireNativeDiagnostic(diagnostics, stage)
      bindProviderSendPermitTransport(this.options.permit, this.#child.owner, {
        providerNamespace: this.options.providerNamespace,
        configurationDigest: this.profile.configurationDigest,
      })
      requireNativeDiagnostic(diagnostics, stage, 'ACCEPTED')
      requireNativeDiagnostic(diagnostics, 'OUTCOME_ATTACH', 'SETTLED')
    } catch (error) {
      diagnostics?.record(stage, 'REFUSED', 'BOUNDARY_REFUSED')
      throw error
    }
  }
  #admitRequestSequence(method: RpcRequestMethod) {
    if (
      this.#poison ||
      this.#revoked ||
      this.#cleaned ||
      this.#requests >= requestSequence.length ||
      method !== requestSequence[this.#requests++]
    ) {
      this.#poisonSource()
      fail()
    }
  }
  #beforeRequest(method: RpcRequestMethod, params: Record<string, unknown>) {
    this.#admitRequestSequence(method)
    this.#requestShape(method, params)
    if (method === 'thread/start') {
      if (!this.#initialized) fail()
      this.#healthy()
      assertProviderSendPermitOwned(this.options.permit)
      this.#startup.assertReady()
      const expected = {
        ephemeral: true,
        model: nativeQualificationModel,
        sandbox: 'read-only',
        approvalPolicy: 'never',
      }
      if (Object.entries(expected).some(([key, value]) => params[key] !== value)) fail()
    }
    if (method === 'turn/start') this.#turnRequest(params)
  }
  #requestShape(method: RpcRequestMethod, params: Record<string, unknown>) {
    const keys = {
      initialize: ['capabilities', 'clientInfo'],
      'config/read': ['cwd', 'includeLayers'],
      'thread/start': ['approvalPolicy', 'cwd', 'ephemeral', 'model', 'sandbox'],
      'mcpServerStatus/list': ['detail', 'limit', 'serverName', 'threadId'],
      'turn/start': ['effort', 'input', 'model', 'threadId'],
    }
    const expected = keys[method as keyof typeof keys]
    if (!expected || canonicalOutcomeJson(Object.keys(params).sort()) !== canonicalOutcomeJson([...expected].sort()))
      fail()
    if (
      method === 'initialize' &&
      canonicalOutcomeJson(params.capabilities) !== canonicalOutcomeJson({ experimentalApi: false })
    )
      fail()
  }
  #configurationRequest(params: Record<string, unknown>) {
    const cwd = `${inspectNativeQualificationPlan(this.profile.plan).manifest.freshRoot}/cwd`
    if (params.cwd !== cwd || params.includeLayers !== false) fail()
  }
  #turnRequest(params: Record<string, unknown>) {
    const actualEnvelope = { input: params.input, model: params.model, effort: params.effort }
    if (
      params.threadId !== this.#threadId ||
      outcomeDigest(canonicalOutcomeJson(actualEnvelope)) !==
        inspectNativeQualificationPlan(this.profile.plan).manifest.envelopeDigest
    )
      fail()
  }
  #reply(method: RpcRequestMethod | 'initialized', value: unknown) {
    if (method === 'initialized') {
      if (this.#initialized) fail()
      this.#initialized = true
      return
    }
    if (!record(value)) fail()
    if (method === 'initialize') this.#startup.settledInitialize()
    if (method === 'config/read') this.#configurationReply(value)
    if (method === 'thread/start') this.#threadReply(value.thread)
    if (method === 'turn/start') this.#turnReply(value.turn)
  }
  #configurationReply(value: Record<string, unknown>) {
    const captured = inspectNativeQualificationPlan(this.profile.plan)
    if (!verifyNativeQualificationConfiguration(value, captured.manifest, captured.capability)) fail()
    this.#privateStateHome(value.config, `${captured.manifest.freshRoot}/codex-home`)
    this.#startup.verifiedConfiguration()
  }
  #privateStateHome(config: unknown, privateHome: string) {
    if (!record(config)) fail()
    const selected = config.sqlite_home
    // Pinned loader applies all effective/managed values here. The closed native environment omits
    // CODEX_SQLITE_HOME; absence/null therefore selects this exact fresh CODEX_HOME fallback.
    if (selected != null && selected !== privateHome) fail()
  }
  #threadReply(thread: unknown) {
    if (
      !record(thread) ||
      !nativeThreadUuid(thread.id) ||
      thread.ephemeral !== true ||
      !Array.isArray(thread.turns) ||
      thread.turns.length
    )
      fail()
    if (this.#threadId && this.#threadId !== thread.id) fail()
    this.#threadId = thread.id
  }
  #turnReply(turn: unknown, notificationMethod?: string) {
    if (!record(turn) || typeof turn.id !== 'string') fail()
    if (this.#turnId && this.#turnId !== turn.id) {
      if (notificationMethod !== undefined) this.#refuseNotification(notificationMethod, 'TURN_SCOPE_MISMATCH')
      fail()
    }
    this.#turnId = turn.id
  }
  #recordNotificationRefusal(method: string, reason: NativeSourceNotificationRefusal) {
    if (this.#notificationRefusalRecorded) return
    this.#notificationRefusalRecorded = true
    this.options.diagnostics?.record(nativePassiveOutcomeStage(method), 'REFUSED', reason)
  }
  #refuseNotification(method: string, reason: NativeSourceNotificationRefusal): never {
    this.#recordNotificationRefusal(method, reason)
    return fail()
  }
  #canDrainExpectedLoss() {
    const loss = this.options.qualificationLoss
      ? inspectNativeQualificationLoss(this.options.qualificationLoss).proof
      : undefined
    return loss?.VALIDATED && !loss.UNPROVEN && !this.#passivePoison
  }
  #notification(method: string, params: Record<string, unknown>) {
    try {
      const lossCapture = this.#canDrainExpectedLoss()
      // Expected loss never restores outcome authority; passive semantic validation still drains to EOF.
      if ((this.#poison && !lossCapture) || this.#revoked) fail()
      if (this.#cleaned) this.#refuseNotification(method, 'NOTIFICATION_AFTER_CLEANUP')
      if (this.#candidate) this.#refuseNotification(method, 'NOTIFICATION_AFTER_CANDIDATE')
      if (++this.#notificationCount > 8192) this.#refuseNotification(method, 'NOTIFICATION_LIMIT_EXCEEDED')
      this.#dispatchNotification(method, params)
    } catch {
      this.#recordNotificationRefusal(method, 'SOURCE_NOTIFICATION_REFUSED')
      this.#passivePoison = true
      this.#poisonSource()
      fail()
    }
  }
  #dispatchNotification(method: string, params: Record<string, unknown>) {
    if (method === 'configWarning' || method === 'account/updated') return this.#startup.notification(method, params)
    if (method === 'remoteControl/status/changed') return this.#remoteStatus(params)
    this.#dispatchCorrelatedNotification(method, params)
  }
  #dispatchCorrelatedNotification(method: string, params: Record<string, unknown>) {
    if ('threadId' in params && params.threadId !== this.#threadId)
      this.#refuseNotification(method, 'THREAD_SCOPE_MISMATCH')
    if (method === 'thread/started') return this.#threadNotification(params)
    if (method === 'warning') return this.#threadStartupWarning(params)
    if (method === 'turn/started' || method === 'turn/completed') return this.#turnNotification(method, params)
    if (method === 'thread/status/changed') this.#threadStatus(params.status)
    this.#ordinaryNotification(method, params)
  }
  #remoteStatus(params: Record<string, unknown>) {
    if (params.status !== 'disabled')
      this.#refuseNotification('remoteControl/status/changed', 'REMOTE_STATUS_NOT_DISABLED')
    if (params.environmentId != null)
      this.#refuseNotification('remoteControl/status/changed', 'REMOTE_ENVIRONMENT_PRESENT')
    if (++this.#remoteDisabled > 32)
      this.#refuseNotification('remoteControl/status/changed', 'REMOTE_STATUS_LIMIT_EXCEEDED')
  }
  #threadStatus(status: unknown) {
    if (!record(status) || status.type === 'systemError') fail()
    if (this.#completion > 0 && status.type === 'active') fail()
    if (Array.isArray(status.activeFlags) && status.activeFlags.length > 0) fail()
  }
  #threadNotification(params: Record<string, unknown>) {
    if (this.#threadStarted || this.#requests < 3 || !record(params.thread) || !nativeThreadUuid(params.thread.id))
      fail()
    if (this.#threadId && this.#threadId !== params.thread.id)
      this.#refuseNotification('thread/started', 'THREAD_SCOPE_MISMATCH')
    this.#threadStarted = true
    this.#threadId = params.thread.id
  }
  #threadStartupWarning(params: Record<string, unknown>) {
    // Session creation repeats the reviewed config deprecation with the owning thread ID.
    if (params.message !== nativeStartupWarning) this.#refuseNotification('warning', warningRefusal(params.message))
    if (this.#threadStartupWarningSeen) this.#refuseNotification('warning', 'WARNING_THREAD_DEPRECATION_DUPLICATE')
    if (
      this.#requests < 3 ||
      this.#requests >= 5 ||
      !this.#threadId ||
      params.threadId !== this.#threadId ||
      Object.keys(params).length !== 2
    )
      this.#refuseNotification('warning', 'WARNING_THREAD_DEPRECATION_OUT_OF_WINDOW')
    this.#threadStartupWarningSeen = true
  }
  #turnNotification(method: string, params: Record<string, unknown>) {
    if (this.#requests !== 5) fail()
    this.#turnReply(params.turn, method)
    if (method === 'turn/started') {
      if (this.#turnStarted || this.#completion > 0) fail()
      this.#turnStarted = true
      return
    }
    if (!record(params.turn)) fail()
    if (++this.#completion !== 1 || params.turn.status !== 'completed' || params.turn.error !== null) fail()
  }
  #ordinaryNotification(method: string, params: Record<string, unknown>) {
    if ('turnId' in params && (!this.#turnId || params.turnId !== this.#turnId))
      this.#refuseNotification(method, 'TURN_SCOPE_MISMATCH')
    if (method.startsWith('item/')) {
      this.#itemNotification(params)
      return
    }
    if (
      ![
        'account/rateLimits/updated',
        'thread/tokenUsage/updated',
        'thread/status/changed',
        'thread/readState/changed',
        'mcpServer/startupStatus/updated',
        'turn/plan/updated',
        'turn/diff/updated',
      ].includes(method)
    )
      this.#refuseNotification(method, 'UNCLASSIFIED_NOTIFICATION')
  }
  #itemNotification(params: Record<string, unknown>) {
    if (this.#completion > 0 || this.#requests !== 5 || !this.#threadId || params.threadId !== this.#threadId) fail()
  }
  gateway(promise: Promise<unknown>) {
    this.#observe(promise, this.#gateway)
  }
  supervisorOperation(promise: Promise<unknown>) {
    this.#observe(promise, this.#supervisor)
  }
  captureSdkClose(original: Promise<Readonly<{ closed: boolean; effectUnknown: boolean }>>) {
    if (this.#sdkCloseCaptured) {
      this.#poisonSource()
      fail()
    }
    this.#sdkCloseCaptured = true
    this.#observe(original, this.#sdkCleanup, value => {
      if (!record(value) || value.closed !== true || value.effectUnknown !== false) {
        this.#poisonSource()
        return
      }
      this.#sdkClosed = true
    })
  }
  captureSupervisorStop(original: Promise<unknown>) {
    this.#observe(original, this.#supervisorStop)
  }
  #beginFreeze() {
    if (this.options.qualificationLoss) fail()
    this.#startup.close()
    if (this.#freezeEntered) fail()
    this.#freezeEntered = true
    if (this.#supervisorStop.length !== 1) fail()
  }
  async freezeCandidate() {
    this.#beginFreeze()
    await this.#supervisorStop[0].observation
    this.#healthy()
    if (this.#candidate || !this.#child || !this.#threadId || !this.#turnId) fail()
    this.#assertNativeCompletion()
    const all = this.#assertOperationsSettled()
    await Promise.all(all.map(item => item.observation))
    this.#healthy()
    const state = this.#child.snapshot()
    this.#assertClosedTransport(state)
    inspectNativeOutcomeProfile(this.options.profile)
    this.#sender = sealConsumedProviderSender(this.options.permit, this.#child.sealSender(), {
      threadId: this.#threadId,
      turnId: this.#turnId,
    })
    const exclusion = inspectProviderSenderExcluded(this.#sender)
    if (
      exclusion.finalWatermark.issuedRequests !== state.issuedRequests ||
      exclusion.finalWatermark.writtenBytes !== state.writtenBytes
    )
      fail()
    const identity = { ...exclusion } as Record<string, unknown>
    delete identity.senderEvidenceId
    delete identity.finalWatermark
    const body = Object.freeze({
      version: 'M13_NATIVE_OUTCOME_CANDIDATE_V1',
      candidateId: randomUUID(),
      sourceSemantics: 'CONDITIONAL_PINNED_SOURCE',
      hostIsolation: 'NOT_ATTESTED',
      helperLifetime: 'UNKNOWN',
      profileDigest: this.profile.profileDigest,
      dossierDigest: this.profile.dossierDigest,
      artifactDigest: this.profile.artifactDigest,
      identityDigest: outcomeDigest(canonicalOutcomeJson(identity)),
      identity: Object.freeze(identity),
      coveredThrough: exclusion.finalWatermark,
      sourceId: this.sourceId,
      sourceIncarnation: this.sourceIncarnation,
      operations: this.#operations.length,
      gatewayOperations: this.#gateway.length,
      supervisorOperations: this.#supervisor.length,
      sdkCleanupOperations: this.#sdkCleanup.length,
      supervisorStopOperations: this.#supervisorStop.length,
    })
    const candidateDigest = outcomeDigest(canonicalOutcomeJson(body))
    await this.journal.bindAndSeal(identity as ProviderReconciliationIdentity, candidateDigest)
    this.#candidateDigest = candidateDigest
    this.#candidate = body
    this.#reviewDeadline = Date.now() + this.options.reviewControl.reviewMs
    return Object.freeze({ ...body, candidateDigest: this.#candidateDigest })
  }
  #assertClosedTransport(state: ReturnType<RpcTransport['snapshot']>) {
    if (
      state.status !== 'fenced' ||
      state.pendingRequests ||
      state.writing ||
      state.issuedRequests !== 5 ||
      state.writtenBytes < 1
    )
      fail()
  }
  #assertNativeCompletion() {
    const exact = [
      this.#cleaned,
      this.#sdkClosed,
      this.#completion === 1,
      this.#requests === 5,
      this.#initialized,
      this.#operations.length === 6,
    ]
    if (!exact.every(Boolean)) fail()
  }
  acceptTaskReview(decision: NativeOutcomeReviewDecision) {
    if (this.#decisionEntered) fail()
    this.#decisionEntered = true
    this.#healthy()
    if (!this.#candidate || !this.#reviewDeadline || !this.#sender || !this.#candidateDigest) fail()
    this.#validateReviewDecision(decision)
    inspectNativeOutcomeProfile(this.options.profile)
    const exclusion = inspectProviderSenderExcluded(this.#sender)
    const identity = { ...exclusion } as Record<string, unknown>
    delete identity.senderEvidenceId
    delete identity.finalWatermark
    if (outcomeDigest(canonicalOutcomeJson(identity)) !== decision.identityDigest) fail()
    this.#assertOperationsSettled()
    if (!this.#cleaned || !this.#sdkClosed) fail()
    this.#proof = Object.freeze({})
    this.#physical = Object.freeze({
      ...identity,
      sourceId: this.sourceId,
      provenance: 'NATIVE_QUALIFIED',
      qualificationDigest: this.profile.profileDigest,
      protocolDigest: nativeOutcomeProtocolDigest,
      evidenceId: `native_evidence_${randomUUID()}`,
      evidenceDigest: this.#candidateDigest,
      evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE',
      outcome: 'TERMINAL',
      conflictStatus: 'CLEAR',
      coveredThrough: exclusion.finalWatermark,
    }) as ProviderPhysicalOutcomeRecord
    this.#source = Object.freeze({
      sourceId: this.sourceId,
      provenance: 'NATIVE_QUALIFIED',
      qualificationDigest: this.profile.profileDigest,
      protocolDigest: nativeOutcomeProtocolDigest,
      providerNamespace: this.options.providerNamespace,
      configurationDigest: this.profile.configurationDigest,
      inspect: proof => this.#inspect(proof),
    })
    sources.set(this.#source, this)
    this.#enrolled = true
    return Object.freeze({
      context: Object.freeze({ selection: 'NATIVE', source: this.#source }) as ProviderReconciliationContext,
      physicalEvidence: this.#proof,
      senderExcluded: this.#sender,
      candidateDigest: this.#candidateDigest,
    })
  }
  #validateReviewDecision(decision: NativeOutcomeReviewDecision) {
    if (!this.#candidate || !this.#reviewDeadline || Date.now() > this.#reviewDeadline) fail()
    const exact = {
      version: 'M13_NATIVE_OUTCOME_REVIEW_V1',
      decision: 'ACCEPT',
      reviewerId: this.options.reviewControl.reviewerId,
      nonce: this.options.reviewControl.nonce,
      candidateDigest: this.#candidateDigest,
      dossierDigest: this.profile.dossierDigest,
      profileDigest: this.profile.profileDigest,
      artifactDigest: this.profile.artifactDigest,
      identityDigest: this.#candidate.identityDigest,
    }
    const expectedKeys = [...Object.keys(exact), 'actualReviewReceiptDigest'].sort()
    if (canonicalOutcomeJson(Object.keys(decision).sort()) !== canonicalOutcomeJson(expectedKeys)) fail()
    if (Object.entries(exact).some(([key, value]) => decision[key as keyof NativeOutcomeReviewDecision] !== value))
      fail()
    if (!/^sha256:[a-f0-9]{64}$/.test(decision.actualReviewReceiptDigest)) fail()
  }
  #assertOperationsSettled() {
    const all = [
      ...this.#operations,
      ...this.#gateway,
      ...this.#supervisor,
      ...this.#sdkCleanup,
      ...this.#supervisorStop,
    ]
    if (all.some(item => !item.settled)) fail()
    return all
  }
  #inspect(proof: unknown) {
    this.#healthy()
    if (!this.#enrolled || proof !== this.#proof || !this.#physical || this.#revoked) fail()
    if (this.journal.state().sealedEnvelopeDigest !== this.#physical.evidenceDigest) fail()
    return this.#physical
  }
  revoke() {
    this.#poisonSource()
    this.#revoked = true
  }
  acquire(
    proof: unknown,
    sender: ProviderSenderExcluded,
    client: PrismaClient,
    expected: ProviderReconciliationReceipt,
    request: Readonly<{ observationKey: string; requestHash: string }>,
  ): SqliteOutcomeCustody & { captureTransaction(operation: Promise<unknown>): void } {
    this.#healthy()
    if (
      this.#reconciliationEntered ||
      sender !== this.#sender ||
      !this.#source ||
      !this.#reviewDeadline ||
      Date.now() > this.#reviewDeadline + this.options.reviewControl.reconciliationMs
    )
      fail()
    assertProviderSourceDatabaseClient(this.options.database, client)
    const actual = validateProviderReconciliationRecord(sender, this.#source, this.#inspect(proof))
    if (
      canonicalOutcomeJson(expected) !== canonicalOutcomeJson(actual) ||
      providerReconciliationRequestHash(expected.identity.intentId, request.observationKey, actual) !==
        request.requestHash
    )
      fail()
    inspectNativeOutcomeProfile(this.options.profile)
    this.#reconciliationEntered = true
    const hold = acquireProviderSourceDatabaseHold(this.options.database, 'RECONCILE', {
      intentId: expected.identity.intentId,
      ...request,
    })
    const original = {
      key: request.observationKey,
      hash: request.requestHash,
      receipt: actual,
      hold,
      lookup: false,
      completed: false,
      retired: false,
    }
    this.#replay = original
    return Object.freeze({
      state: this.journal.state(),
      captureTransaction: operation => {
        if (this.#replay!.operation || !(operation instanceof Promise)) fail()
        this.#replay!.operation = operation
      },
      assertTransactionSettings: tx =>
        assertProviderSourceTransactionSettingsForClient(client, tx, hold, 'RECONCILE_CANONICAL'),
      verifyLocked: (state, records) => {
        this.#healthy()
        this.#inspect(proof)
        this.journal.verifyLocked(state, records)
      },
      completeFulfilled: () =>
        hold.complete(() => {
          original.completed = true
          this.#startup.close()
          this.#revoked = true
        }),
      retire: operation => {
        this.#replay!.retired = true
        this.#replay!.operation = operation
        hold.retire(operation)
        this.#startup.close()
        this.#revoked = true
      },
      tryResolveCommittedReplay: () => this.replay(client, request.observationKey, request.requestHash),
    })
  }
  replayInput(
    input: {
      intentId: string
      observationKey: string
      senderExcluded?: ProviderSenderExcluded
      physicalEvidence?: unknown
      replayRequestHash?: string
    },
    client: PrismaClient,
  ) {
    if (input.intentId !== this.initialIdentity.intentId) fail()
    if (!this.#replay) return undefined
    if (
      input.observationKey !== this.#replay.key ||
      (input.replayRequestHash
        ? input.replayRequestHash !== this.#replay.hash
        : input.senderExcluded !== this.#sender || input.physicalEvidence !== this.#proof)
    )
      fail()
    return this.replay(client, this.#replay.key, this.#replay.hash)
  }
  #assertReplayAdmission(original: {
    lookup: boolean
    operation?: Promise<unknown>
    completed: boolean
    retired: boolean
  }) {
    if (original.lookup || !original.operation) fail()
    if (!original.completed && !original.retired) fail()
  }
  async replay(client: PrismaClient, key: string, hash: string): Promise<NativeOutcomeReplay | undefined> {
    assertProviderSourceDatabaseClient(this.options.database, client)
    const original = this.#replay
    if (!original || original.key !== key || original.hash !== hash) fail()
    if (original.result) return original.result
    this.#assertReplayAdmission(original)
    original.lookup = true
    const result = await readNativeOutcomeCommittedReplay(
      this.options.database,
      original.receipt,
      key,
      hash,
      this.journal.records(),
      original.completed ? undefined : original.hold,
    )
    if (
      result &&
      (original.completed ||
        resolveProviderSourceDatabaseHold(original.hold, () => {
          original.completed = true
        }))
    )
      original.result = result
    return original.result
  }
}
export async function createOriginalNativeOutcomeCandidate(options: NativeOutcomeCandidateOptions) {
  const original = new OriginalNativeOutcome(options)
  await original.initialize()
  return Object.freeze({
    attach: original.attach.bind(original),
    gateway: original.gateway.bind(original),
    supervisorOperation: original.supervisorOperation.bind(original),
    captureSdkClose: original.captureSdkClose.bind(original),
    captureSupervisorStop: original.captureSupervisorStop.bind(original),
    freezeCandidate: original.freezeCandidate.bind(original),
    acceptTaskReview: original.acceptTaskReview.bind(original),
    revoke: original.revoke.bind(original),
  })
}
export type OriginalNativeOutcomeCandidate = Awaited<ReturnType<typeof createOriginalNativeOutcomeCandidate>>
export function acquireOriginalNativeOutcomeCustody(
  source: ProviderPhysicalOutcomeSource,
  proof: unknown,
  sender: ProviderSenderExcluded,
  client: PrismaClient,
  expected: ProviderReconciliationReceipt,
  request: Readonly<{ observationKey: string; requestHash: string }>,
) {
  const original = sources.get(source)
  if (
    !original ||
    expected.physical.protocolDigest !== nativeOutcomeProtocolDigest ||
    expected.physical.outcome !== 'TERMINAL'
  )
    fail()
  return original.acquire(proof, sender, client, expected, request)
}
export function isOriginalNativeOutcomeSource(source: ProviderPhysicalOutcomeSource | undefined) {
  return !!source && sources.has(source)
}
export async function readOriginalNativeOutcomeReplay(
  source: ProviderPhysicalOutcomeSource,
  input: {
    intentId: string
    observationKey: string
    senderExcluded?: ProviderSenderExcluded
    physicalEvidence?: unknown
    replayRequestHash?: string
  },
  client: PrismaClient,
) {
  const original = sources.get(source)
  if (!original) fail()
  return original.replayInput(input, client)
}
