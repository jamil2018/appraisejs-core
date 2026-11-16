import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { outcomeDigest } from './outcome-source-contract'
import type { CapturedNativeQualificationPlan } from './native-qualification-contract'
import type { OwnedChildCleanupReceipt } from './owned-child'
import type { NativeOutcomeProfile } from './native-outcome-profile'
import type { PauseQualityJourneyInput } from '@/services/coordinator/quality-journey-recovery-service'

export const nativeQualificationLossProtocolIdentity = 'M13_ORIGINAL_LOSS_CONTROL_V1'

export type NativeQualificationLossKind = 'R2_NATIVE_START_ACK_LOSS' | 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS'
declare const lossBrand: unique symbol
export type NativeQualificationLossControl = Readonly<{ [lossBrand]: true }>
type Scope = Readonly<{ journeyId: string; targetProjectId: string; workItemId: string; attemptId: string }>
type PauseIntent = Readonly<{
  idempotencyKey: string
  reason: string
  expectedVersion?: number
  expectedStateHash?: string
}>
export type NativeQualificationLossOptions = Readonly<{
  caseKind: NativeQualificationLossKind
  fixture: object
  client: PrismaClient
  plan: CapturedNativeQualificationPlan
  profile: NativeOutcomeProfile
  absoluteCleanupDeadline: number
  pause: PauseIntent
}>
type Selection = Readonly<{
  rawWorkerArgumentsDigest: string
  normalizedArgumentsDigest: string
  charterHash: string
  charterRevisionId: string
  nativeEnvelopeDigest: string
  workerInputDigest: string
  idempotencyKey: string
}>
type Artifact = Readonly<{ id: string; contentHash: string; resultDigest: string; requestPayloadDigest: string }>
type Runtime = Readonly<{ child: object; owner: object; endpoint: object; logicalFence(): void }>
type Release = Readonly<{ pauseCommitted: boolean; emergency: boolean }>
const digest = (value: unknown) => outcomeDigest(canonicalContractJson(value))
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
function refuse(): never {
  throw new Error('Original qualification loss control required')
}

/** One original controller, one physical gate. This module imports no DB/recovery implementation. */
class LossController {
  phase: 'DECLARED' | 'ARMED' | 'HOLDING' | 'RELEASED' | 'UNPROVEN' = 'DECLARED'
  scope?: Scope
  runtime?: Runtime
  selection?: Selection
  artifact?: Artifact
  validated = false
  withheld = false
  pauseCommitted = false
  emergency = false
  selected = false
  selectionSource?: object
  endpointClaimed = false
  cleanupDeadline: number
  boundaryDeadline?: number
  pauseInput?: Readonly<PauseQualityJourneyInput>
  parser?: Readonly<{ owner: object; consume(id: number): void }>
  childCleanupProven = false
  childCleanup?: Promise<OwnedChildCleanupReceipt>
  deferredDisconnect?: () => boolean
  readonly operations = new Set<Promise<unknown>>()
  readonly release: Promise<Release>
  #resolveRelease!: (value: Release) => void
  #released = false
  #timer?: ReturnType<typeof setTimeout>
  constructor(readonly options: NativeQualificationLossOptions) {
    this.cleanupDeadline = options.absoluteCleanupDeadline
    this.release = new Promise(resolve => {
      this.#resolveRelease = resolve
    })
  }
  retain<T>(operation: Promise<T>): Promise<T> {
    if (!(operation instanceof Promise)) refuse()
    this.operations.add(operation)
    void operation.then(
      () => this.operations.delete(operation),
      () => {
        this.operations.delete(operation)
        this.fail()
      },
    )
    return operation
  }
  releasePhysical(emergency: boolean) {
    if (this.#released) return
    this.#released = true
    this.emergency ||= emergency
    if (emergency) this.phase = 'UNPROVEN'
    else this.phase = 'RELEASED'
    if (this.#timer) clearTimeout(this.#timer)
    this.#resolveRelease(Object.freeze({ pauseCommitted: this.pauseCommitted, emergency: this.emergency }))
  }
  fail() {
    this.emergency = true
    this.phase = 'UNPROVEN'
    this.releasePhysical(true)
  }
  tighten(deadline: number) {
    if (!Number.isSafeInteger(deadline)) refuse()
    this.cleanupDeadline = Math.min(this.cleanupDeadline, deadline)
    if (this.boundaryDeadline !== undefined) {
      this.boundaryDeadline = Math.min(this.boundaryDeadline, this.cleanupDeadline)
      this.armDeadline()
    }
  }
  armDeadline() {
    if (this.#timer) clearTimeout(this.#timer)
    if (this.#released || this.boundaryDeadline === undefined) return
    this.#timer = setTimeout(() => this.fail(), Math.max(0, this.boundaryDeadline - Date.now()))
  }
  hold() {
    if (this.phase !== 'ARMED' || !this.runtime || !this.scope) refuse()
    // HOLDING precedes any callback, SDK rejection, diagnostic or cleanup reentry.
    this.phase = 'HOLDING'
    this.validated = true
    this.boundaryDeadline = Math.min(Date.now() + 5000, this.cleanupDeadline)
    this.armDeadline()
    try {
      this.runtime.logicalFence()
    } catch {
      this.fail()
    }
    if (this.phase === 'HOLDING') this.retain(this.startPause()).catch(() => this.fail())
  }
  async read() {
    if (!this.scope) refuse()
    const { getQualityJourney } = await import('@/services/coordinator/quality-journey-service')
    return this.retain(getQualityJourney(this.scope, this.options.client))
  }
  capturePauseInput(expectedVersion: number | undefined, expectedStateHash: string | undefined) {
    if (!this.scope) refuse()
    if (!Number.isSafeInteger(expectedVersion) || typeof expectedStateHash !== 'string') refuse()
    // Only exact canonical pause keys participate; work/attempt IDs are not pause inputs.
    return Object.freeze({
      journeyId: this.scope.journeyId,
      targetProjectId: this.scope.targetProjectId,
      expectedVersion: expectedVersion!,
      expectedStateHash,
      idempotencyKey: this.options.pause.idempotencyKey,
      reason: this.options.pause.reason,
    })
  }
  async startPause() {
    if (!this.scope || this.boundaryDeadline === undefined) refuse()
    let expectedVersion = this.options.pause.expectedVersion,
      expectedStateHash = this.options.pause.expectedStateHash
    if (this.options.caseKind === 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS') {
      const current = await this.read()
      if (this.phase !== 'HOLDING' || current.journey.status !== 'ACTIVE') refuse()
      expectedVersion = current.journey.version
      expectedStateHash = current.journey.stateHash
    }
    this.pauseInput = this.capturePauseInput(expectedVersion, expectedStateHash)
    const { pauseQualityJourneyOperational } = await import('@/services/coordinator/quality-journey-recovery-service')
    if (this.phase !== 'HOLDING' || Date.now() >= this.boundaryDeadline) refuse()
    // Retain the real service Promise. Its cleanup may depend on this controller's physical release.
    const pause = this.retain(pauseQualityJourneyOperational(this.pauseInput, this.options.client))
    void pause.catch(() => {
      this.emergency = true
      this.phase = 'UNPROVEN'
      if (!this.pauseCommitted) this.fail()
    })
    await this.pollPauseCommit()
  }
  async pollPauseCommit() {
    if (this.boundaryDeadline === undefined) refuse()
    for (let attempt = 0; attempt < 200 && this.phase === 'HOLDING' && Date.now() < this.boundaryDeadline; attempt++) {
      const current = await this.read()
      if (this.phase !== 'HOLDING' || Date.now() >= this.boundaryDeadline) return
      if (this.matchesPause(current)) {
        this.pauseCommitted = true
        this.releasePhysical(false)
        return
      }
      await new Promise<void>(resolve =>
        setTimeout(resolve, Math.min(25, Math.max(0, this.boundaryDeadline! - Date.now()))),
      )
    }
    if (!this.pauseCommitted) this.fail()
  }
  matchesPause(current: Awaited<ReturnType<LossController['read']>>) {
    const input = this.pauseInput
    if (!input || !this.scope) return false
    const eventId = `qje_${createHash('sha256').update(`${input.journeyId}:PAUSE:${input.idempotencyKey}`).digest('hex').slice(0, 24)}`
    const operational = current.events.filter(event =>
      ['OPERATIONAL_PAUSE', 'OPERATIONAL_RESUME'].includes(event.eventType),
    )
    const event = operational.at(-1)
    if (!event || event.id !== eventId || event.eventType !== 'OPERATIONAL_PAUSE') return false
    return (
      this.matchesPausedJourney(current.journey, input) &&
      this.matchesPauseEvent(event, current.journey.stateHash, input)
    )
  }
  matchesPausedJourney(
    current: Awaited<ReturnType<LossController['read']>>['journey'],
    input: PauseQualityJourneyInput,
  ) {
    return (
      current.journeyId === input.journeyId &&
      current.targetProjectId === input.targetProjectId &&
      current.status === 'PAUSED' &&
      current.version === input.expectedVersion + 1 &&
      current.stateHash === input.expectedStateHash
    )
  }
  matchesPauseEvent(
    event: Awaited<ReturnType<LossController['read']>>['events'][number],
    successorHash: string,
    input: PauseQualityJourneyInput,
  ) {
    if (
      event.journeyId !== input.journeyId ||
      event.targetProjectId !== input.targetProjectId ||
      event.predecessorStateHash !== input.expectedStateHash ||
      event.successorStateHash !== successorHash
    )
      return false
    let payload: unknown
    try {
      payload = JSON.parse(event.payloadJson)
    } catch {
      return false
    }
    return this.matchesPausePayload(payload, input)
  }
  matchesPausePayload(payload: unknown, input: PauseQualityJourneyInput) {
    return (
      record(payload) &&
      payload.operation === 'PAUSE' &&
      payload.requestHash === digest({ operation: 'PAUSE', ...input }) &&
      payload.version === input.expectedVersion + 1 &&
      payload.status === 'PAUSED' &&
      payload.reasonHash === digest(input.reason)
    )
  }
}
const controls = new WeakMap<NativeQualificationLossControl, LossController>()
function original(control: NativeQualificationLossControl) {
  const value = controls.get(control)
  if (!value) refuse()
  return value
}

export function createNativeQualificationLossControl(
  options: NativeQualificationLossOptions,
): NativeQualificationLossControl
export function createNativeQualificationLossControl(options?: Readonly<{ caseKind: 'NONE' }>): undefined
export function createNativeQualificationLossControl(
  options?: NativeQualificationLossOptions | Readonly<{ caseKind: 'NONE' }>,
): NativeQualificationLossControl | undefined {
  if (!options || options.caseKind === 'NONE') return undefined
  if (
    !['R2_NATIVE_START_ACK_LOSS', 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS'].includes(options.caseKind) ||
    !options.fixture ||
    !options.client ||
    !options.plan ||
    !options.profile ||
    !Number.isSafeInteger(options.absoluteCleanupDeadline) ||
    options.absoluteCleanupDeadline <= Date.now() ||
    !options.pause.idempotencyKey ||
    !options.pause.reason
  )
    refuse()
  if (
    options.caseKind === 'R2_NATIVE_START_ACK_LOSS'
      ? !Number.isSafeInteger(options.pause.expectedVersion) ||
        !/^sha256:[a-f0-9]{64}$/.test(options.pause.expectedStateHash ?? '')
      : options.pause.expectedVersion !== undefined || options.pause.expectedStateHash !== undefined
  )
    refuse()
  const control = Object.freeze({}) as NativeQualificationLossControl
  controls.set(control, new LossController(Object.freeze({ ...options, pause: Object.freeze({ ...options.pause }) })))
  return control
}
export function bindNativeQualificationLossControl(
  control: NativeQualificationLossControl,
  binding: {
    fixture: object
    client: PrismaClient
    plan: CapturedNativeQualificationPlan
    profile: NativeOutcomeProfile
    scope: Scope
  },
) {
  const value = original(control)
  if (
    value.phase !== 'DECLARED' ||
    Date.now() >= value.cleanupDeadline ||
    ['fixture', 'client', 'plan', 'profile'].some(key => value.options[key as 'fixture'] !== binding[key as 'fixture'])
  )
    refuse()
  value.scope = Object.freeze({ ...binding.scope })
  value.phase = 'ARMED'
}
export function bindNativeQualificationLossRuntime(control: NativeQualificationLossControl, runtime: Runtime) {
  const value = original(control)
  if (value.phase !== 'ARMED' || value.runtime) refuse()
  value.runtime = Object.freeze({ ...runtime })
}
export function assertNativeQualificationLossGateway(control?: NativeQualificationLossControl) {
  if (!control) return
  const value = original(control)
  if (value.options.caseKind === 'R2_NATIVE_START_ACK_LOSS' || value.phase !== 'ARMED' || value.selected) refuse()
}
export function bindNativeQualificationAnalysisSource(control: NativeQualificationLossControl, source: object) {
  const value = original(control)
  if (value.phase !== 'ARMED' || value.selectionSource) refuse()
  value.selectionSource = source
}
export function selectNativeQualificationAnalysis(
  control: NativeQualificationLossControl,
  source: object,
  selection: Selection,
) {
  const value = original(control)
  if (
    value.selectionSource !== source ||
    value.options.caseKind !== 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS' ||
    value.phase !== 'ARMED' ||
    value.selected
  )
    refuse()
  if (
    [
      'rawWorkerArgumentsDigest',
      'normalizedArgumentsDigest',
      'charterHash',
      'workerInputDigest',
      'nativeEnvelopeDigest',
    ].some(key => !/^sha256:[a-f0-9]{64}$/.test(selection[key as 'charterHash'])) ||
    !selection.idempotencyKey ||
    !selection.charterRevisionId
  )
    refuse()
  value.selected = true
  value.selection = Object.freeze({ ...selection })
}
export function acceptNativeQualificationAnalysis(
  control: NativeQualificationLossControl,
  source: object,
  artifact: Artifact,
) {
  const value = original(control)
  if (
    value.selectionSource !== source ||
    !value.selected ||
    !value.selection ||
    artifact.contentHash !== value.selection.charterHash ||
    artifact.id !== value.selection.charterRevisionId ||
    value.artifact
  )
    refuse()
  value.artifact = Object.freeze({ ...artifact })
  value.hold()
}
/** Called only from the original child after its private protocol receipt consumes successfully. */
export function bindNativeQualificationLossParser(
  control: NativeQualificationLossControl,
  owner: object,
  consume: (id: number) => void,
) {
  const value = original(control)
  if (value.phase !== 'ARMED' || value.parser) refuse()
  value.parser = Object.freeze({ owner, consume })
}
export function assertNativeQualificationLossSender(control?: NativeQualificationLossControl) {
  if (control) {
    const value = original(control)
    if (value.phase !== 'ARMED' || Date.now() >= value.cleanupDeadline) {
      value.fail()
      refuse()
    }
  }
}
export function withholdNativeQualificationStartReply(
  control: NativeQualificationLossControl,
  owner: object,
  requestId: number,
) {
  const value = original(control)
  if (
    value.options.caseKind !== 'R2_NATIVE_START_ACK_LOSS' ||
    value.phase !== 'ARMED' ||
    value.runtime?.owner !== owner
  )
    refuse()
  if (value.parser?.owner !== owner) refuse()
  value.parser.consume(requestId)
  value.hold()
  value.withheld = true
}
export function matchesNativeQualificationAnalysisReplyLoss(
  control: NativeQualificationLossControl,
  call: { toolName: string; arguments: Record<string, unknown> },
) {
  const value = original(control)
  return (
    value.options.caseKind === 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS' &&
    value.validated &&
    !value.emergency &&
    !value.endpointClaimed &&
    call.toolName === 'quality_journey_analysis_submit' &&
    value.selection?.rawWorkerArgumentsDigest === digest(call.arguments)
  )
}
export function claimNativeQualificationAnalysisReplyLoss(
  control: NativeQualificationLossControl,
  endpoint: object,
  call: { toolName: string; arguments: Record<string, unknown> },
) {
  const value = original(control)
  if (value.runtime?.endpoint !== endpoint || !matchesNativeQualificationAnalysisReplyLoss(control, call)) refuse()
  value.endpointClaimed = true
  value.withheld = true
}
export function tightenNativeQualificationLossCleanup(control: NativeQualificationLossControl, deadline: number) {
  original(control).tighten(deadline)
}
export function failNativeQualificationLoss(control: NativeQualificationLossControl) {
  original(control).fail()
}
export function retainNativeQualificationLossOperation<T>(
  control: NativeQualificationLossControl,
  operation: Promise<T>,
) {
  return original(control).retain(operation)
}
export function waitNativeQualificationLossPhysicalRelease(control?: NativeQualificationLossControl): Promise<Release> {
  if (!control) return Promise.resolve(Object.freeze({ pauseCommitted: false, emergency: false }))
  const value = original(control)
  if (value.phase === 'DECLARED' || value.phase === 'ARMED') value.fail()
  return value.release
}
export function deferNativeQualificationLossPhysical(control: NativeQualificationLossControl, action: () => void) {
  const value = original(control)
  const operation = waitNativeQualificationLossPhysicalRelease(control).then(() => {
    action()
  })
  value.retain(operation)
}
export function deferNativeQualificationLossDisconnect(
  control: NativeQualificationLossControl,
  disconnect: () => boolean,
): boolean {
  const value = original(control)
  value.deferredDisconnect ??= disconnect
  if (!value.childCleanupProven || value.operations.size || (!value.pauseCommitted && !value.emergency)) return false
  const originalDisconnect = value.deferredDisconnect
  value.deferredDisconnect = undefined
  return originalDisconnect()
}
export function captureNativeQualificationLossChildCleanup(
  control: NativeQualificationLossControl,
  child: object,
  operation: Promise<OwnedChildCleanupReceipt>,
) {
  const value = original(control)
  if (value.runtime?.child !== child || value.childCleanup || !(operation instanceof Promise)) {
    value.fail()
    refuse()
  }
  value.childCleanup = operation
  value.retain(operation)
  void operation.then(
    receipt => {
      value.childCleanupProven =
        receipt.status === 'stopped' &&
        receipt.groupExitObserved &&
        receipt.privateRootRemoved &&
        !receipt.privateRootRetained
      if (!value.childCleanupProven) {
        value.fail()
        return
      }
      void waitNativeQualificationLossQuiescence(control).then(
        () => {
          if (value.deferredDisconnect) deferNativeQualificationLossDisconnect(control, value.deferredDisconnect)
        },
        () => {},
      )
    },
    () => {
      value.childCleanupProven = false
      value.fail()
    },
  )
}
export async function waitNativeQualificationLossQuiescence(control: NativeQualificationLossControl) {
  const value = original(control)
  while (value.operations.size) await Promise.allSettled([...value.operations])
}
export function assertNativeQualificationLossQuiescent(control: NativeQualificationLossControl) {
  const value = original(control)
  if (value.operations.size || !value.pauseCommitted || value.emergency || !value.withheld || !value.childCleanupProven)
    refuse()
}
export function nativeQualificationLossKind(control: NativeQualificationLossControl) {
  return original(control).options.caseKind
}
export function inspectNativeQualificationLoss(control: NativeQualificationLossControl) {
  const value = original(control)
  return Object.freeze({
    caseKind: value.options.caseKind,
    cleanupDeadline: value.cleanupDeadline,
    boundaryDeadline: value.boundaryDeadline ?? null,
    phase: value.phase,
    proof: Object.freeze({
      VALIDATED: value.validated,
      WITHHELD: value.withheld,
      PAUSE_COMMITTED: value.pauseCommitted,
      UNPROVEN: value.emergency,
    }),
    unsettledOriginalOperations: value.operations.size,
    selection: value.selection ?? null,
    artifact: value.artifact ?? null,
    pause: value.pauseInput
      ? Object.freeze({
          expectedVersion: value.pauseInput.expectedVersion,
          expectedStateHash: value.pauseInput.expectedStateHash,
          version: value.pauseInput.expectedVersion + 1,
          eventId: `qje_${createHash('sha256').update(`${value.pauseInput.journeyId}:PAUSE:${value.pauseInput.idempotencyKey}`).digest('hex').slice(0, 24)}`,
          requestHash: digest({ operation: 'PAUSE', ...value.pauseInput }),
          reasonHash: digest(value.pauseInput.reason),
        })
      : null,
  })
}
