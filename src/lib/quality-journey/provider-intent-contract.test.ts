import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { RpcTransport, inspectRpcTransportSeal } from './codex-app-server/rpc-transport'
import {
  createProviderSendPermit,
  trustedProviderArm,
  bindProviderSendPermitTransport,
  consumeProviderSendPermit,
  sealConsumedProviderSender,
  inspectProviderSenderExcluded,
  assertProviderSendPermitOwned,
  inspectProviderSendPermitTransport,
  disableProviderSendPermit,
  trustedProviderReconciliation,
} from './provider-intent-contract'

function originalSender() {
  const identity = {
    runId: `run_${randomUUID()}`,
    intentId: `intent_${randomUUID()}`,
    sendBoundaryId: `boundary_${randomUUID()}`,
    claimEpoch: 1,
  }
  const permit = createProviderSendPermit(identity, trustedProviderArm)
  const transport = new RpcTransport(
    { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() },
    { onFault() {}, onNotification() {} },
  )
  const binding = { providerNamespace: `synthetic:${randomUUID()}`, configurationDigest: `sha256:${'a'.repeat(64)}` }
  bindProviderSendPermitTransport(permit, transport.owner, { ...binding, owner: {} } as typeof binding)
  void transport.request('initialize', {}).catch(() => {})
  consumeProviderSendPermit(permit)
  const seal = transport.sealSender()
  return { identity, permit, transport, binding, seal }
}

describe('original consumed provider sender exclusion', () => {
  it('retrieves only the original bound owner and immutable identity without consuming', () => {
    const identity = { runId: 'run', intentId: 'intent', sendBoundaryId: randomUUID(), claimEpoch: 1 }
    const permit = createProviderSendPermit(identity, trustedProviderArm)
    expect(() => inspectProviderSendPermitTransport(permit)).toThrow('not bound')
    const transport = new RpcTransport(
      { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() },
      { onFault() {}, onNotification() {} },
    )
    const binding = { providerNamespace: 'synthetic:local', configurationDigest: `sha256:${'a'.repeat(64)}` }
    bindProviderSendPermitTransport(permit, transport.owner, binding)
    identity.runId = 'mutated'
    binding.providerNamespace = 'mutated'
    const original = inspectProviderSendPermitTransport(permit)
    expect(original).toEqual({
      owner: transport.owner,
      providerNamespace: 'synthetic:local',
      configurationDigest: `sha256:${'a'.repeat(64)}`,
      identity: permit,
    })
    expect(Object.isFrozen(original)).toBe(true)
    expect(Object.isFrozen(original.identity)).toBe(true)
    expect(Object.keys(original).sort()).toEqual(['configurationDigest', 'identity', 'owner', 'providerNamespace'])
    expect(() => inspectProviderSendPermitTransport({ ...permit })).toThrow('unavailable')
    expect(() => bindProviderSendPermitTransport(permit, transport.owner, binding)).toThrow('already bound')
    expect(consumeProviderSendPermit(permit)).toBe(permit)
    expect(inspectProviderSendPermitTransport(permit).owner).toBe(transport.owner)
    expect(() => consumeProviderSendPermit(permit)).toThrow('already consumed')
    sealConsumedProviderSender(permit, transport.sealSender(), { threadId: null, turnId: null })
    expect(() => inspectProviderSendPermitTransport(permit)).toThrow('disabled')
  })

  it('refuses copied owners, consumed rebinding and disabled lookup', () => {
    const identity = { runId: 'run', intentId: 'intent', sendBoundaryId: randomUUID(), claimEpoch: 1 }
    const permit = createProviderSendPermit(identity, trustedProviderArm)
    const transport = new RpcTransport(
      { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() },
      { onFault() {}, onNotification() {} },
    )
    const binding = { providerNamespace: 'synthetic:local', configurationDigest: `sha256:${'a'.repeat(64)}` }
    expect(() => bindProviderSendPermitTransport(permit, { ...transport.owner }, binding)).toThrow('Exact original')
    bindProviderSendPermitTransport(permit, transport.owner, binding)
    disableProviderSendPermit(permit, trustedProviderReconciliation)
    expect(() => inspectProviderSendPermitTransport(permit)).toThrow('disabled')
    const consumed = createProviderSendPermit({ ...identity, sendBoundaryId: randomUUID() }, trustedProviderArm)
    consumeProviderSendPermit(consumed)
    expect(() => bindProviderSendPermitTransport(consumed, transport.owner, binding)).toThrow('consumed')
    transport.sealSender()
  })

  it('uses the original owner and disables original WeakMap permit; extra native fields cannot replace identity', () => {
    const f = originalSender()
    const proof = sealConsumedProviderSender(f.permit, f.seal, {
      threadId: 'thread',
      turnId: 'turn',
      runId: 'forged',
      sendBoundaryId: 'foreign',
      senderEvidenceId: 'forged',
    } as { threadId: string; turnId: string })
    const record = inspectProviderSenderExcluded(proof)
    expect(record).toMatchObject({ ...f.identity, ...f.binding, threadId: 'thread', turnId: 'turn' })
    expect(record.senderEvidenceId).not.toBe('forged')
    expect(() => assertProviderSendPermitOwned(f.permit)).toThrow('disabled')
    expect(() => consumeProviderSendPermit(f.permit)).toThrow('unavailable')
    expect(() => inspectProviderSenderExcluded({ ...proof })).toThrow('Exact original')
    expect(record.finalWatermark.issuedRequests).toBe(1)
    expect(record.finalWatermark.writtenBytes).toBeGreaterThan(0)
  })

  it('rejects a genuine but foreign transport seal and a copied original permit', () => {
    const first = originalSender()
    const second = originalSender()
    expect(inspectRpcTransportSeal(first.seal).owner).not.toBe(inspectRpcTransportSeal(second.seal).owner)
    expect(() => sealConsumedProviderSender(first.permit, second.seal, { threadId: null, turnId: null })).toThrow(
      'original transport',
    )
    expect(() => sealConsumedProviderSender({ ...first.permit }, first.seal, { threadId: null, turnId: null })).toThrow(
      'original transport',
    )
  })
})
