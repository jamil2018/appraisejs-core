import { describe, expect, it, vi } from 'vitest'
import { E2_ENVELOPE_VERSION, e2EnvelopeDigest, type E2FiniteEnvelope } from '../provider-grant-contract'
import {
  createInertE2CustodyCore,
  type E2CoreObservation,
  type E2GrantRequest,
  type E2InertGrantCandidate,
  type E2TransactionOwner,
} from './native-e2-custody-core'
import {
  refuseUnqualifiedE2RecoveryControl,
  requestOriginalE2Grant,
  spawnOriginalAfterGrant,
  type CommittedE2Command,
  type E2ParentGrantRequest,
  type OriginalE2Owner,
} from './native-e2-parent-owner'
const { createOwner, observeOriginalTransaction, constructAfterObservation } = createInertE2CustodyCore()

const digest = 'a'.repeat(64)
const requestDigest = 'b'.repeat(64)
const commitReceiptDigest = 'c'.repeat(64)
const nonce = '00112233445566778899aabbccddeeff'
const envelope: E2FiniteEnvelope = {
  version: E2_ENVELOPE_VERSION, runId: 'run', intentId: 'intent', operationId: 'op0',
  rangeId: 'op0', parentOperationId: null, sourceTupleDigest: digest, sequence: 0,
  kind: 'NATIVE_START', setupStage: null, payloadDigest: null, payloadByteLength: null,
  payloadReceiveTimeoutMs: null, maxBytes: 0, maxFrames: 0, maxControlFrames: 0,
  maxDescendants: 1,
}
const receipt = Object.freeze({ operationId: envelope.operationId, requestDigest,
  envelopeDigest: e2EnvelopeDigest(envelope), commitReceiptDigest })
const affirmative: E2InertGrantCandidate = { status: 'AFFIRMATIVE', receipt }
const owner = () => createOwner({ runId: envelope.runId, intentId: envelope.intentId,
  sourceTupleDigest: envelope.sourceTupleDigest, prospectiveNonce: nonce })
const grantRequest = (candidate: E2InertGrantCandidate = affirmative): E2GrantRequest<object> => ({
  envelope, requestDigest, issueE2GrantInTx: vi.fn(async () => candidate),
})
const transaction = (): E2TransactionOwner<object> => ({
  $transaction: async callback => {
    const result = await callback({})
    return result
  },
})
const fakeChild = () => ({ stdio: [null, null, null, {}, {}] as readonly unknown[] })

describe('isolated inert E2 custody core', () => {
  it('does not admit foreign factory tokens or turn a fixture owner into production authority', async () => {
    const original = owner()
    const other = createInertE2CustodyCore()
    expect(await other.observeOriginalTransaction(original, transaction(), grantRequest()))
      .toEqual({ status: 'REFUSED', reason: 'INVALID_REQUEST' })
    const result = await observeOriginalTransaction(original, transaction(), grantRequest())
    expect(result.status).toBe('COMMIT_OBSERVED')
    if (result.status !== 'COMMIT_OBSERVED') return
    const constructor = vi.fn(fakeChild)
    expect(await other.constructAfterObservation(original, result.observation, constructor))
      .toEqual({ status: 'REFUSED' })
    expect(constructor).not.toHaveBeenCalled()
    const injectedIssuer = vi.fn(async () => affirmative)
    const input = { envelope, requestDigest, issueE2GrantInTx: injectedIssuer } as unknown as E2ParentGrantRequest
    expect(await requestOriginalE2Grant(original as unknown as OriginalE2Owner, input))
      .toEqual({ status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_SOURCE' })
    expect(injectedIssuer).not.toHaveBeenCalled()
    expect(await spawnOriginalAfterGrant(
      original as unknown as OriginalE2Owner,
      result.observation as unknown as CommittedE2Command,
    )).toEqual({ status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_SOURCE' })
  })
  it('E2-T01 starts exactly once only after outer commit fulfills', async () => {
    const original = owner()
    let finishCommit: (() => void) | undefined
    const commitGate = new Promise<void>(resolve => { finishCommit = resolve })
    let markCallbackDone: (() => void) | undefined
    const callbackDone = new Promise<void>(resolve => { markCallbackDone = resolve })
    const events: string[] = []
    const db: E2TransactionOwner<object> = {
      $transaction: async callback => {
        const candidate = await callback({})
        events.push('callback-done')
        markCallbackDone?.()
        await commitGate
        events.push('outer-commit-fulfilled')
        return candidate
      },
    }
    const construct = vi.fn(() => { events.push('construct'); return fakeChild() })
    const pending = observeOriginalTransaction(original, db, grantRequest())
    await callbackDone
    expect(events).toContain('callback-done')
    expect(construct).not.toHaveBeenCalled()
    finishCommit?.()
    const result = await pending
    expect(result.status).toBe('COMMIT_OBSERVED')
    if (result.status !== 'COMMIT_OBSERVED') throw new Error('expected one committed observation')
    const spawn = await constructAfterObservation(original, result.observation, construct)
    expect(spawn.status).toBe('FIXTURE_CONSTRUCTOR_RETURNED')
    expect(events).toEqual(['callback-done', 'outer-commit-fulfilled', 'construct'])
    expect(construct).toHaveBeenCalledTimes(1)
    expect(await constructAfterObservation(original, result.observation, construct)).toEqual({ status: 'REFUSED' })
    expect(construct).toHaveBeenCalledTimes(1)
  })

  it('E2-T02 loses the spawn return without constructing a second child', async () => {
    const original = owner()
    const result = await observeOriginalTransaction(original, transaction(), grantRequest())
    if (result.status !== 'COMMIT_OBSERVED') throw new Error('expected one committed observation')
    const construct = vi.fn(() => { throw new Error('return lost after possible construction') })
    expect(await constructAfterObservation(original, result.observation, construct)).toEqual({ status: 'FIXTURE_CONSTRUCTOR_UNKNOWN' })
    expect(await constructAfterObservation(original, result.observation, construct)).toEqual({ status: 'REFUSED' })
    expect(construct).toHaveBeenCalledTimes(1)
  })

  it('E2-T07 burns the flight when callback succeeds but outer commit rejects', async () => {
    const original = owner()
    const request = grantRequest()
    const db: E2TransactionOwner<object> = { $transaction: async callback => {
      await callback({})
      throw new Error('ambiguous outer commit reply')
    } }
    expect(await observeOriginalTransaction(original, db, request)).toEqual({ status: 'UNKNOWN_NO_DISPATCH' })
    expect(await observeOriginalTransaction(original, transaction(), request)).toEqual({ status: 'UNKNOWN_NO_DISPATCH' })
    expect(request.issueE2GrantInTx).toHaveBeenCalledTimes(1)
  })

  it('E2-T08 refuses copied callback results, copied receipts, replay and foreign owners', async () => {
    const copied = owner()
    const copyingDb: E2TransactionOwner<object> = { $transaction: async callback => {
      const candidate = await callback({})
      return { ...candidate } as typeof candidate
    } }
    expect(await observeOriginalTransaction(copied, copyingDb, grantRequest())).toEqual({ status: 'UNKNOWN_NO_DISPATCH' })
    const receiptOnly = await observeOriginalTransaction(owner(), transaction(),
      grantRequest({ status: 'READ_ONLY_RECEIPT', receipt: { ...receipt } }))
    expect(receiptOnly).toEqual({ status: 'READ_ONLY_RECEIPT', receipt })
    expect('observation' in receiptOnly).toBe(false)
    const original = owner()
    const request = grantRequest()
    const result = await observeOriginalTransaction(original, transaction(), request)
    if (result.status !== 'COMMIT_OBSERVED') throw new Error('expected one committed observation')
    expect(await observeOriginalTransaction(original, transaction(), request)).toEqual({
      status: 'READ_ONLY_RECEIPT', receipt,
    })
    const construct = vi.fn(fakeChild)
    const foreign = owner()
    expect(await constructAfterObservation(foreign, result.observation, construct)).toEqual({ status: 'REFUSED' })
    expect(await constructAfterObservation(original, { ...receipt } as unknown as E2CoreObservation,
      construct)).toEqual({ status: 'REFUSED' })
    expect(await constructAfterObservation(original, JSON.parse(JSON.stringify(result.observation)) as E2CoreObservation,
      construct)).toEqual({ status: 'REFUSED' })
    expect(construct).not.toHaveBeenCalled()
    expect(await constructAfterObservation(original, result.observation, construct)).toMatchObject({
      status: 'FIXTURE_CONSTRUCTOR_RETURNED',
    })
    expect(construct).toHaveBeenCalledTimes(1)
    expect(refuseUnqualifiedE2RecoveryControl()).toEqual({
      status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_CONTROL',
    })
  })
})
