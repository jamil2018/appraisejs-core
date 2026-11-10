import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalE2Json, E2_ENVELOPE_DIGEST_DOMAIN, E2_ENVELOPE_VERSION, e2EnvelopeDigest,
  e2PayloadDigest, parseE2FiniteEnvelope, prechargeE2Actor, type E2ActorTotals,
  type E2FiniteEnvelope,
} from './provider-grant-contract'

const digest = 'a'.repeat(64)
const empty = e2PayloadDigest(Buffer.alloc(0))
const start: E2FiniteEnvelope = {
  version: E2_ENVELOPE_VERSION, runId: 'run', intentId: 'intent', operationId: 'op0',
  rangeId: 'op0', parentOperationId: null, sourceTupleDigest: digest, sequence: 0,
  kind: 'NATIVE_START', setupStage: null, payloadDigest: null, payloadByteLength: null,
  payloadReceiveTimeoutMs: null, maxBytes: 0, maxFrames: 0, maxControlFrames: 0,
  maxDescendants: 1,
}
const setup: E2FiniteEnvelope = { ...start, sequence: 1, operationId: 'op1', rangeId: 'op1',
  parentOperationId: 'op0', kind: 'SETUP', setupStage: 'DNS', maxDescendants: 0 }
const provider: E2FiniteEnvelope = { ...setup, sequence: 2, operationId: 'op2', rangeId: 'op2',
  parentOperationId: 'op1', kind: 'PROVIDER_REQUEST', setupStage: null, payloadDigest: empty,
  payloadByteLength: 0, payloadReceiveTimeoutMs: 5000, maxBytes: 262_144, maxFrames: 32,
  maxControlFrames: 8 }
const totals: E2ActorTotals = { operationsReserved: 0, bytesReserved: 0, framesReserved: 0,
  nativeStartsReserved: 0, setupReserved: 0, providerRequestsReserved: 0,
  mcpCallsReserved: 0, recoveryControlsReserved: 0 }

describe('E2 finite operation contract', () => {
  it('has a stable sorted canonical cross-language digest vector', () => {
    expect(canonicalE2Json({ z: [0, 'é'], a: { y: true, x: null } })).toBe(
      '{"a":{"x":null,"y":true},"z":[0,"é"]}',
    )
    const canonical = canonicalE2Json(start)
    expect(canonical.startsWith('{"intentId":"intent","kind":"NATIVE_START"')).toBe(true)
    expect(e2EnvelopeDigest(start)).toBe(createHash('sha256')
      .update(`${E2_ENVELOPE_DIGEST_DOMAIN}\n${canonical}`, 'utf8').digest('hex'))
    expect(e2EnvelopeDigest({ ...start, maxDescendants: 1 })).toBe(e2EnvelopeDigest(start))
    expect(e2PayloadDigest(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('enforces every kind boundary, exact payload tuple and strict envelope fields', () => {
    expect(parseE2FiniteEnvelope(start)).toEqual(start)
    expect(parseE2FiniteEnvelope(setup)).toEqual(setup)
    expect(parseE2FiniteEnvelope(provider)).toEqual(provider)
    const mcp = { ...provider, kind: 'MCP_CALL', maxBytes: 65_536, maxFrames: 16, maxControlFrames: 0 }
    expect(parseE2FiniteEnvelope(mcp).kind).toBe('MCP_CALL')
    for (const bad of [
      { ...start, extra: true }, { ...start, kind: 'RECOVERY_CONTROL' },
      { ...start, sourceTupleDigest: `sha256:${digest}` }, { ...start, sequence: 1 },
      { ...start, maxDescendants: 0 }, { ...start, rangeId: 'another' },
      { ...setup, setupStage: 'TLS', maxFrames: 9 }, { ...setup, maxBytes: 1 },
      { ...provider, payloadDigest: null }, { ...provider, payloadByteLength: 262_145 },
      { ...provider, payloadReceiveTimeoutMs: 4999 }, { ...provider, maxControlFrames: 9 },
      { ...mcp, maxFrames: 17 }, { ...mcp, setupStage: 'DNS' },
      { ...provider, maxBytes: -0 }, { ...provider, maxFrames: 2_147_483_648 },
    ]) expect(() => parseE2FiniteEnvelope(bad)).toThrow()
    for (const bad of [undefined, -0, -1, 1.5, Number.POSITIVE_INFINITY, { a: undefined }, '\ud800'])
      expect(() => canonicalE2Json(bad)).toThrow()
  })

  it('precharges bounded actor totals once and refuses aggregate multiplication', () => {
    const one = prechargeE2Actor(totals, start)
    const two = prechargeE2Actor(one, setup)
    const three = prechargeE2Actor(two, provider)
    expect(three).toMatchObject({ operationsReserved: 3, nativeStartsReserved: 1,
      setupReserved: 1, providerRequestsReserved: 1, bytesReserved: 262_144,
      framesReserved: 32 })
    expect(() => prechargeE2Actor(one, start)).toThrow()
    expect(() => prechargeE2Actor(two, setup, ['DNS'])).toThrow('setup_stage_reused')
    expect(() => prechargeE2Actor({ ...totals, operationsReserved: 32 }, provider)).toThrow()
    expect(() => prechargeE2Actor({ ...totals, bytesReserved: 8_388_608 }, provider)).toThrow()
    expect(() => prechargeE2Actor({ ...totals, framesReserved: 512 }, provider)).toThrow()
    expect(() => prechargeE2Actor({ ...totals, recoveryControlsReserved: 1 }, provider)).toThrow()
  })
})
