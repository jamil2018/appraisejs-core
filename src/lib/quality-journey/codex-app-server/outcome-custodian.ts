import { PassThrough, Writable } from 'node:stream'
import { RpcTransport, inspectRpcTransportSeal, type RpcTransportSeal } from './rpc-transport'
import type { OutcomeObservationJournal } from './outcome-source-sqlite-journal'
import {
  outcomeActivationRoutes,
  outcomeSourceBounds,
  OutcomeSourceUnknownError,
  type OutcomeActivationRoute,
  type OutcomeCustodyState,
} from './outcome-source-contract'

type Allocation = 'ALLOCATED' | 'NOT_EMITTED' | 'ATTEMPTED' | 'DISCARDED'
type Frame = { requestId: number | null; start: number; end: number; discarded: boolean }

/**
 * Synthetic fresh custody only: owns a discard sink, never receives provider ports.
 * This is a cooperative host boundary, not native or hostile-host containment.
 */
export class SyntheticOutcomeCustodian {
  readonly transport: RpcTransport
  #journal: OutcomeObservationJournal
  #state: OutcomeCustodyState = 'PREACTIVATION'
  #mayHaveActivated = false
  #allocations = new Map<number, Allocation>()
  #frames: Frame[] = []
  #bytes = 0
  #allocationClearCalls = 0
  #frameClearCalls = 0
  #originalOwner
  #sealSender: () => RpcTransportSeal
  constructor(journal: OutcomeObservationJournal) {
    this.#journal = journal
    const stdin = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        try {
          if (this.#state !== 'PREACTIVATION') throw new OutcomeSourceUnknownError('custody_closed')
          const frame = this.#frames.at(-1)
          if (!Buffer.isBuffer(chunk) || !frame || frame.discarded || chunk.length !== frame.end - frame.start)
            throw new OutcomeSourceUnknownError('unobserved_handoff')
          // Actual owned sink observation, independent of sender accounting. Never forwards.
          this.#append('DISCARDED', { requestId: frame.requestId, start: frame.start, end: frame.end })
          frame.discarded = true
          if (frame.requestId !== null) this.#allocations.set(frame.requestId, 'DISCARDED')
          callback(new Error('custody_discarded'))
        } catch {
          this.#state = 'UNKNOWN'
          callback(new Error('custody_unavailable'))
        }
      },
    })
    this.transport = new RpcTransport(
      { stdin, stdout: new PassThrough(), stderr: new PassThrough() },
      {
        onFault: () => {},
        onNotification: () => {
          throw new OutcomeSourceUnknownError('unexpected_notification')
        },
      },
      {
        assertAdmission: () => {
          if (this.#state !== 'PREACTIVATION') throw new OutcomeSourceUnknownError('custody_closed')
          this.#journal.assertObservationAdmission?.()
        },
        allocated: id => {
          if (
            this.#state !== 'PREACTIVATION' ||
            id !== this.#allocations.size + 1 ||
            id > outcomeSourceBounds.allocations
          )
            return this.#unknown('allocation_limit_or_state')
          this.#append('ALLOCATED', { id })
          this.#allocations.set(id, 'ALLOCATED')
        },
        notEmitted: id => {
          if (this.#allocations.get(id) !== 'ALLOCATED') return this.#unknown('allocation_missing')
          this.#append('NOT_EMITTED', { id })
          this.#allocations.set(id, 'NOT_EMITTED')
        },
        attempted: range => {
          if (
            this.#state !== 'PREACTIVATION' ||
            range.start !== this.#bytes ||
            range.end <= range.start ||
            this.#frames.length >= outcomeSourceBounds.frames ||
            (range.requestId !== null && this.#allocations.get(range.requestId) !== 'ALLOCATED')
          )
            return this.#unknown('attempt_range')
          this.#append('ATTEMPTED', range)
          this.#frames.push({ ...range, discarded: false })
          this.#bytes = range.end
          if (range.requestId !== null) this.#allocations.set(range.requestId, 'ATTEMPTED')
        },
      },
    )
    this.#originalOwner = this.transport.owner
    this.#sealSender = this.transport.sealSender.bind(this.transport)
  }
  #append(kind: string, data: Readonly<Record<string, unknown>>): void {
    try {
      this.#journal.append(kind, data)
    } catch (error) {
      this.#state = 'UNKNOWN'
      throw error
    }
  }
  #unknown(reason: string): never {
    this.#state = 'UNKNOWN'
    throw new OutcomeSourceUnknownError(reason)
  }
  reserveActivation(route: OutcomeActivationRoute): never {
    if (this.#state !== 'PREACTIVATION') return this.#unknown('activation_after_close')
    this.#mayHaveActivated = true
    this.#state = 'MAY_HAVE_ACTIVATED'
    if (!outcomeActivationRoutes.includes(route)) return this.#unknown('unknown_activation_route')
    this.#append('MAY_HAVE_ACTIVATED', { route })
    this.#sealSender()
    throw new OutcomeSourceUnknownError('activation_unavailable')
  }
  close(): void {
    this.#sealSender()
    if (this.#state === 'PREACTIVATION') {
      this.#state = 'CLOSED'
      this.#append('CLOSED', {})
    }
  }
  /** Original maps only; no journal/SQL access, seal, or deferred work on the capture stack. */
  assertSynchronousDiscardComplete() {
    if (
      this.#mayHaveActivated ||
      !['PREACTIVATION', 'CLOSED'].includes(this.#state) ||
      [...this.#allocations.values()].some(state => state !== 'NOT_EMITTED' && state !== 'DISCARDED') ||
      this.#frames.some(frame => !frame.discarded)
    )
      throw new OutcomeSourceUnknownError('incomplete_or_activated_range')
    return Object.freeze({ issuedRequests: this.#allocations.size, writtenBytes: this.#bytes })
  }
  capture(seal: RpcTransportSeal) {
    this.close()
    this.#journal.assertHealthy()
    const original = inspectRpcTransportSeal(seal)
    if (
      original.owner !== this.#originalOwner ||
      this.#state !== 'CLOSED' ||
      this.#mayHaveActivated ||
      original.issuedRequests !== this.#allocations.size ||
      original.writtenBytes !== this.#bytes
    )
      throw new OutcomeSourceUnknownError('incomplete_or_activated_range')
    return this.assertSynchronousDiscardComplete()
  }

  /** Called only after the original source lifetime gate authorizes destruction. */
  destroyOriginalState(): void {
    this.#sealSender()
    this.#allocations.clear()
    this.#allocationClearCalls++
    this.#frames = []
    this.#frameClearCalls++
    this.#bytes = 0
    this.#state = 'CLOSED'
  }
  /** Non-authoritative diagnostics of actual original private resources. */
  diagnostics() {
    return Object.freeze({
      allocationEntries: this.#allocations.size,
      frameEntries: this.#frames.length,
      discardedFrames: this.#frames.filter(frame => frame.discarded).length,
      attemptedBytes: this.#bytes,
      mayHaveActivated: this.#mayHaveActivated,
      allocationClearCalls: this.#allocationClearCalls,
      frameClearCalls: this.#frameClearCalls,
    })
  }
  snapshot() {
    return Object.freeze({
      state: this.#state,
      allocations: this.#allocations.size,
      attemptedBytes: this.#bytes,
      discardedFrames: this.#frames.filter(frame => frame.discarded).length,
    })
  }
}
