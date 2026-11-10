import { describe, expect, it } from 'vitest'
import { E2_ENVELOPE_VERSION, e2EnvelopeDigest, e2PayloadDigest } from '../provider-grant-contract'
import {
  assertE2PrivateCommandMatchesGrant, assertE2PrivateReceiptMatchesGrant, decodeE2PrivateFrame,
  e2PrivateNonceDigest, E2PayloadAssembly, E2PrivateFrameDecoder, E2StartupOrder, encodeE2PrivateFrame,
  E2_PRIVATE_VERSION, validateE2PrivateFrame,
} from './native-e2-private-protocol'

const digest = 'a'.repeat(64)
const childNonce = '01'.repeat(16)
const childDigest = e2PayloadDigest(Buffer.from(childNonce, 'hex'))
const oneUseNonce = '02'.repeat(16)
const common = (type: string, frameSequence: number) => ({ version: E2_PRIVATE_VERSION, type,
  sourceTupleDigest: digest, parentIncarnationDigest: digest, prospectiveChildNonceDigest: digest,
  runId: 'run', intentId: 'intent', frameSequence })
const hello = { ...common('HELLO', 0) }
const helloAck = { ...common('HELLO_ACK', 0), childIncarnationNonce: childNonce,
  childIncarnationDigest: childDigest }
const bind = { ...common('BIND', 1), childIncarnationDigest: childDigest, grantSequence: 0,
  operationId: 'op0', rangeId: 'op0', kind: 'NATIVE_START', envelopeDigest: digest,
  commitReceiptDigest: digest, oneUseNonce }
const setup = { ...common('COMMAND', 2), childIncarnationDigest: childDigest, grantSequence: 1,
  operationId: 'op1', rangeId: 'op1', kind: 'SETUP', envelopeDigest: digest,
  commitReceiptDigest: digest, oneUseNonce, maxBytes: 0, maxFrames: 0, maxControlFrames: 0,
  maxDescendants: 0, setupStage: 'DNS' }
const accepted = { ...common('ACCEPTED', 1), childIncarnationDigest: childDigest,
  grantSequence: 0, operationId: 'op0', rangeId: 'op0', evidenceDigest: digest,
  observedBytes: 0, observedFrames: 0, pendingWrite: false }
const payload = Buffer.alloc(20_000, 0x61)
const payloadDigest = e2PayloadDigest(payload)
const command = { ...common('COMMAND', 3), childIncarnationDigest: childDigest, grantSequence: 2,
  operationId: 'op2', rangeId: 'op2', kind: 'PROVIDER_REQUEST', envelopeDigest: digest,
  commitReceiptDigest: digest, oneUseNonce, maxBytes: 20_000, maxFrames: 2,
  maxControlFrames: 0, maxDescendants: 0, payloadDigest, payloadByteLength: payload.length,
  payloadReceiveTimeoutMs: 5000 }
const data = (chunkIndex: number, bytes: Buffer, frameSequence: number) =>
  validateE2PrivateFrame('PARENT_TO_CHILD', { ...common('DATA', frameSequence),
    childIncarnationDigest: childDigest, grantSequence: 2, operationId: 'op2', chunkIndex }, bytes)
const end = (frameSequence: number, changes: Record<string, unknown> = {}) =>
  validateE2PrivateFrame('PARENT_TO_CHILD', { ...common('DATA_END', frameSequence),
    childIncarnationDigest: childDigest, grantSequence: 2, operationId: 'op2',
    chunkCount: 2, totalPayloadBytes: 20_000, payloadDigest, ...changes })
const rawFrame = (metadata: string | Buffer, payloadBytes = Buffer.alloc(0)) => {
  const body = Buffer.from(metadata)
  const header = Buffer.alloc(12)
  header.write('E2P1', 0, 'ascii')
  header.writeUInt32BE(body.length, 4)
  header.writeUInt32BE(payloadBytes.length, 8)
  return Buffer.concat([header, body, payloadBytes])
}

describe('E2 strict private two-pipe protocol', () => {
  it('uses exact 12-byte big-endian header and independent startup frame/grant counters', () => {
    expect(e2PrivateNonceDigest(childNonce)).toBe(
      'cc8cd41cef907c4d216069122c4b89936211361f9050a717a1e37ad1862e952f',
    )
    const encoded = encodeE2PrivateFrame('PARENT_TO_CHILD', hello)
    expect(encoded.subarray(0, 4).toString('ascii')).toBe('E2P1')
    expect(encoded.readUInt32BE(4)).toBe(encoded.length - 12)
    expect(encoded.readUInt32BE(8)).toBe(0)
    const parent = new E2PrivateFrameDecoder('PARENT_TO_CHILD')
    const child = new E2PrivateFrameDecoder('CHILD_TO_PARENT')
    const parentFrames = [hello, bind, setup].flatMap(frame => {
      const bytes = encodeE2PrivateFrame('PARENT_TO_CHILD', frame)
      return [...parent.push(bytes.subarray(0, 9)), ...parent.push(bytes.subarray(9))]
    })
    const childFrames = [helloAck, accepted].flatMap(frame => child.push(
      encodeE2PrivateFrame('CHILD_TO_PARENT', frame)))
    expect(parentFrames.map(frame => frame.metadata.frameSequence)).toEqual([0, 1, 2])
    expect(childFrames.map(frame => frame.metadata.frameSequence)).toEqual([0, 1])
    expect(parentFrames[1].metadata.grantSequence).toBe(0)
    expect(parentFrames[2].metadata.grantSequence).toBe(1)
    const startup = new E2StartupOrder()
    startup.observe('PARENT_TO_CHILD', hello)
    startup.observe('CHILD_TO_PARENT', helloAck)
    startup.observe('PARENT_TO_CHILD', bind)
    startup.observe('CHILD_TO_PARENT', accepted)
    startup.observe('PARENT_TO_CHILD', setup)
    expect(startup.complete).toBe(true)
    expect(() => startup.observe('PARENT_TO_CHILD', setup)).toThrow('startup_order')
    expect(() => new E2StartupOrder().observe('PARENT_TO_CHILD', bind)).toThrow('startup_order')
    parent.end(); child.end()
  })

  it('rejects wrong direction, every extra/conditional field, invalid IDs and noncanonical raw JSON', () => {
    for (const bad of [
      { ...hello, grantSequence: 0 }, { ...hello, payloadLength: 0 },
      { ...bind, grantSequence: 1 }, { ...bind, kind: 'SETUP' },
      { ...setup, payloadDigest }, { ...setup, setupStage: 'RECONNECT' },
      { ...command, setupStage: 'DNS' }, { ...command, payloadReceiveTimeoutMs: 4999 },
      { ...command, payloadByteLength: 20_001 }, { ...command, maxControlFrames: 9 },
      { ...command, kind: 'RECOVERY_CONTROL' }, { ...hello, runId: 'x'.repeat(129) },
    ]) expect(() => encodeE2PrivateFrame('PARENT_TO_CHILD', bad)).toThrow()
    expect(() => encodeE2PrivateFrame('PARENT_TO_CHILD', helloAck)).toThrow('direction')
    expect(() => encodeE2PrivateFrame('CHILD_TO_PARENT', { ...helloAck,
      childIncarnationNonce: '03'.repeat(16) })).toThrow('child_nonce_digest')
    const valid = encodeE2PrivateFrame('PARENT_TO_CHILD', hello)
    const json = valid.subarray(12).toString()
    for (const bad of [
      json.replace('"version":', '"version":"M06_E2_PRIVATE_V1","version":'),
      json.replace('"frameSequence":0', '"frameSequence":0.0'),
      json.replace('"frameSequence":0', '"frameSequence":-0'),
      json.replace('"runId":"run"', '"runId":"\\u0072un"'),
      `${json} `,
    ]) expect(() => decodeE2PrivateFrame('PARENT_TO_CHILD', rawFrame(bad))).toThrow()
    expect(() => decodeE2PrivateFrame('PARENT_TO_CHILD', rawFrame(Buffer.from([0xff])))).toThrow('metadata_utf8')
  })

  it('refuses prefix truncation, oversized declared lengths, trailing bytes and DATA bounds', () => {
    const encoded = encodeE2PrivateFrame('PARENT_TO_CHILD', hello)
    for (const bad of [encoded.subarray(0, 11), encoded.subarray(0, -1),
      Buffer.concat([encoded, Buffer.from([0])])])
      expect(() => decodeE2PrivateFrame('PARENT_TO_CHILD', bad)).toThrow()
    const hugeMeta = Buffer.from(encoded.subarray(0, 12))
    hugeMeta.writeUInt32BE(4097, 4)
    expect(() => decodeE2PrivateFrame('PARENT_TO_CHILD', hugeMeta)).toThrow('declared_length')
    const hugePayload = Buffer.from(encoded.subarray(0, 12))
    hugePayload.writeUInt32BE(16_385, 8)
    expect(() => decodeE2PrivateFrame('PARENT_TO_CHILD', hugePayload)).toThrow('declared_length')
    expect(() => validateE2PrivateFrame('PARENT_TO_CHILD', hello, Buffer.from([1]))).toThrow()
    expect(() => data(0, Buffer.alloc(0), 4)).toThrow()
    expect(() => data(0, Buffer.alloc(16_385), 4)).toThrow()
    const decoder = new E2PrivateFrameDecoder('PARENT_TO_CHILD')
    decoder.push(encoded.subarray(0, 7))
    expect(() => decoder.end()).toThrow('partial_eof')
    expect(() => new E2PrivateFrameDecoder('PARENT_TO_CHILD').push(
      encodeE2PrivateFrame('PARENT_TO_CHILD', bind))).toThrow('frame_sequence')
  })

  it('requires complete ordered bytes, exact END, digest and 5000 ms before effect eligibility', () => {
    const assembly = new E2PayloadAssembly(command, 100)
    expect(assembly.consume(data(0, payload.subarray(0, 16_384), 4), 200)).toBeNull()
    expect(assembly.consume(data(1, payload.subarray(16_384), 5), 300)).toBeNull()
    expect(assembly.consume(end(6), 500)).toEqual(payload)
    expect(() => assembly.consume(end(7), 501)).toThrow('assembly_closed')
    const zero = { ...command, payloadDigest: e2PayloadDigest(Buffer.alloc(0)), payloadByteLength: 0 }
    const zeroAssembly = new E2PayloadAssembly(zero, 0)
    const zeroEnd = end(4, { chunkCount: 0, totalPayloadBytes: 0,
      payloadDigest: zero.payloadDigest })
    expect(zeroAssembly.consume(zeroEnd, 4999)).toEqual(Buffer.alloc(0))
    const pending = new E2PayloadAssembly(command, 0)
    expect(() => pending.consume(end(4), 1)).toThrow('assembly_end')
    expect(() => new E2PayloadAssembly(command, 0).consume(
      data(0, Buffer.alloc(100), 4), 1)).toThrow('assembly_chunk')
    expect(() => new E2PayloadAssembly(command, 0).consume(
      data(1, payload.subarray(0, 16_384), 4), 1)).toThrow('assembly_chunk')
    expect(() => new E2PayloadAssembly(command, 0).expire(5000)).toThrow('assembly_timeout')
    const wrongDigest = new E2PayloadAssembly(command, 0)
    wrongDigest.consume(data(0, payload.subarray(0, 16_384), 4), 1)
    wrongDigest.consume(data(1, Buffer.alloc(3616, 0x62), 5), 2)
    expect(() => wrongDigest.consume(end(6), 3)).toThrow('assembly_digest')
  })

  it('joins exact immutable grant fields before a command can be considered', () => {
    const envelope = { version: E2_ENVELOPE_VERSION, runId: 'run', intentId: 'intent',
      operationId: 'op2', rangeId: 'op2', parentOperationId: 'op1', sourceTupleDigest: digest,
      sequence: 2, kind: 'PROVIDER_REQUEST', setupStage: null, payloadDigest,
      payloadByteLength: 20_000, payloadReceiveTimeoutMs: 5000, maxBytes: 20_000,
      maxFrames: 2, maxControlFrames: 0, maxDescendants: 0 }
    const joined = { ...command, envelopeDigest: e2EnvelopeDigest(envelope) }
    expect(assertE2PrivateCommandMatchesGrant(joined, envelope, digest)).toEqual(joined)
    expect(() => assertE2PrivateCommandMatchesGrant(command, envelope, digest)).toThrow('command_grant_join')
    expect(() => assertE2PrivateCommandMatchesGrant({ ...joined, maxBytes: 19_999 }, envelope, digest))
      .toThrow('command_payload')
    expect(() => assertE2PrivateCommandMatchesGrant({ ...joined, payloadDigest: 'b'.repeat(64) }, envelope, digest))
      .toThrow('command_envelope_mismatch')
    const nativeEnvelope = { ...envelope, operationId: 'op0', rangeId: 'op0', parentOperationId: null,
      sequence: 0, kind: 'NATIVE_START', payloadDigest: null, payloadByteLength: null,
      payloadReceiveTimeoutMs: null, maxBytes: 0, maxFrames: 0, maxControlFrames: 0, maxDescendants: 1 }
    expect(assertE2PrivateReceiptMatchesGrant(accepted, nativeEnvelope)).toEqual(accepted)
    expect(() => assertE2PrivateReceiptMatchesGrant({ ...accepted, observedBytes: 1 }, nativeEnvelope))
      .toThrow('receipt_grant_join')
  })
})
