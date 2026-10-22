import { describe, expect, it } from 'vitest'
import {
  canonicalOutcomeJson,
  outcomeSourceProtocolDigest,
  outcomeSourceQualificationDigest,
} from './outcome-source-contract'
import { encodeOutcomeEnvelope, verifyOutcomeEnvelope, type OutcomeEnvelopeBody } from './outcome-source-envelope'

const key = new Uint8Array(32).fill(71)
function body(): OutcomeEnvelopeBody {
  return {
    version: 'M06_OUTCOME_SOURCE_V1',
    sourceIncarnation: 'incarnation',
    senderEvidenceId: 'sender',
    ledgerHead: `sha256:${'a'.repeat(64)}`,
    finalWatermark: { issuedRequests: 1, writtenBytes: 10 },
    record: {
      runId: 'run',
      intentId: 'intent',
      sendBoundaryId: 'boundary',
      claimEpoch: 1,
      providerNamespace: 'synthetic:only',
      configurationDigest: `sha256:${'b'.repeat(64)}`,
      transportId: 'transport',
      transportIncarnation: 'transport_incarnation',
      threadId: null,
      turnId: null,
      sourceId: 'source',
      provenance: 'SYNTHETIC_REPOSITORY',
      qualificationDigest: outcomeSourceQualificationDigest,
      protocolDigest: outcomeSourceProtocolDigest,
      evidenceId: 'evidence',
      evidenceClass: 'AUTHORITATIVE_OPERATION_RANGE',
      outcome: 'NONSTART',
      conflictStatus: 'CLEAR',
      coveredThrough: { issuedRequests: 1, writtenBytes: 10 },
    },
  }
}
describe('bounded source-private authenticated envelope', () => {
  it('roundtrips canonical exact bounded projection and rejects absent/lost/foreign key', () => {
    const value = body()
    const encoded = encodeOutcomeEnvelope(value, key)
    expect(verifyOutcomeEnvelope(encoded, key)).toEqual(value)
    expect(() => verifyOutcomeEnvelope(encoded, new Uint8Array(32).fill(72))).toThrow()
    expect(() => verifyOutcomeEnvelope(encoded, new Uint8Array())).toThrow()
    expect(() => encodeOutcomeEnvelope(value, new Uint8Array())).toThrow()
  })
  it.each([
    ['altered MAC', (s: string) => s.replace(/"mac":"./, '"mac":"f')],
    ['altered body', (s: string) => s.replace('"runId":"run"', '"runId":"foreign"')],
    ['duplicate root', (s: string) => s.replace('{"body":', '{"mac":"' + '0'.repeat(64) + '","body":')],
    ['duplicate nested field', (s: string) => s.replace('"claimEpoch":1', '"claimEpoch":1,"claimEpoch":1')],
    ['noncanonical whitespace', (s: string) => ` ${s}`],
    ['ambiguous escaped text', (s: string) => s.replace('"run"', '"\\u0072un"')],
    ['unknown root', (s: string) => s.replace('{"body":', '{"extra":0,"body":')],
    ['oversized bytes', () => 'x'.repeat(65537)],
    ['invalid JSON', () => '{'],
  ])('rejects %s', (_name, alter) => {
    expect(() => verifyOutcomeEnvelope(alter(encodeOutcomeEnvelope(body(), key)), key)).toThrow()
  })
  it.each([
    [
      'stale protocol',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).protocolDigest = `sha256:${'0'.repeat(64)}`
      },
    ],
    [
      'stale qualification',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).qualificationDigest = `sha256:${'0'.repeat(64)}`
      },
    ],
    [
      'terminal claim',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).outcome = 'TERMINAL'
      },
    ],
    [
      'native escalation',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).provenance = 'NATIVE_QUALIFIED'
      },
    ],
    [
      'nonnull handles',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).threadId = 'native'
      },
    ],
    [
      'stale version',
      (v: Record<string, unknown>) => {
        v.version = 'M06_OUTCOME_SOURCE_V0'
      },
    ],
    [
      'unknown field',
      (v: Record<string, unknown>) => {
        ;(v.record as Record<string, unknown>).unknown = 'field'
      },
    ],
    [
      'missing field',
      (v: Record<string, unknown>) => {
        delete (v.record as Record<string, unknown>).sourceId
      },
    ],
    [
      'partial range',
      (v: Record<string, unknown>) => {
        ;((v.record as Record<string, unknown>).coveredThrough as Record<string, unknown>).writtenBytes = 9
      },
    ],
    [
      'allocation overflow',
      (v: Record<string, unknown>) => {
        ;(v.finalWatermark as Record<string, unknown>).issuedRequests = 65
      },
    ],
    [
      'counter overflow',
      (v: Record<string, unknown>) => {
        ;(v.finalWatermark as Record<string, unknown>).writtenBytes = Number.MAX_SAFE_INTEGER + 1
      },
    ],
  ])('cannot encode %s even with a signing key', (_name, alter) => {
    const value = structuredClone(body()) as unknown as Record<string, unknown>
    alter(value)
    expect(() => encodeOutcomeEnvelope(value as unknown as OutcomeEnvelopeBody, key)).toThrow()
  })
  it('rejects excessive nesting and arrays before authentication', () => {
    let nested: unknown = 0
    for (let i = 0; i < 18; i++) nested = { nested }
    expect(() => verifyOutcomeEnvelope(JSON.stringify({ body: nested, mac: '0'.repeat(64) }), key)).toThrow()
    expect(() =>
      verifyOutcomeEnvelope(JSON.stringify({ body: Array(257).fill(0), mac: '0'.repeat(64) }), key),
    ).toThrow()
  })
  it('rejects prototype-related JSON fields and noncanonical numeric spellings', () => {
    const encoded = encodeOutcomeEnvelope(body(), key)
    expect(() => verifyOutcomeEnvelope(encoded.replace('"claimEpoch":1', '"claimEpoch":1e0'), key)).toThrow()
    expect(() => verifyOutcomeEnvelope(encoded.replace('{"body":', '{"__proto__":{},"body":'), key)).toThrow()
    expect(canonicalOutcomeJson({ b: 0, a: null })).toBe('{"a":null,"b":0}')
  })
})
