import { describe, expect, it } from 'vitest'
import {
  captureOfflineProviderBinding,
  captureOfflineProviderJson,
  captureOfflineProviderTimeouts,
  parseOfflineProviderCompletion,
} from './provider-composition-contract'
const binding = () => ({
  candidateTree: 'a'.repeat(40),
  configurationDigest: `sha256:${'b'.repeat(64)}`,
  protocolDigest: `sha256:${'c'.repeat(64)}`,
  roleProfileDigest: `sha256:${'d'.repeat(64)}`,
  requiredMcpIds: ['z', 'a'],
})
const completion = () => ({
  threadId: 'thread',
  turnId: 'turn',
  status: 'COMPLETED',
  calls: [{ callId: 'call', toolName: 'quality_journey_analysis_submit', arguments: { idempotencyKey: 'one' } }],
})
describe('closed offline provider composition contract', () => {
  it('copies immutable bindings and canonicalizes the required set', () => {
    const source = binding(),
      captured = captureOfflineProviderBinding(source)
    source.requiredMcpIds.push('later')
    source.protocolDigest = `sha256:${'e'.repeat(64)}`
    expect(captured.requiredMcpIds).toEqual(['a', 'z'])
    expect(captured.protocolDigest).toBe(`sha256:${'c'.repeat(64)}`)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured.requiredMcpIds)).toBe(true)
  })
  it.each([
    { candidateTree: 'A'.repeat(40) },
    { configurationDigest: 'plain' },
    { requiredMcpIds: [] },
    { requiredMcpIds: ['same', 'same'] },
    { requiredMcpIds: ['bad id'] },
    { requiredMcpIds: Array.from({ length: 17 }, (_, index) => `s${index}`) },
    { unexpected: 'native' },
  ])('rejects malformed bindings %#', patch => {
    expect(() => captureOfflineProviderBinding({ ...binding(), ...patch })).toThrow()
  })
  it('retains bounded policy-compatible defaults', () => {
    expect(captureOfflineProviderTimeouts()).toEqual({
      acquisitionMs: 10_000,
      initializationMs: 20_000,
      requiredMcpMs: 20_000,
      acknowledgementMs: 60_000,
      completionMs: 900_000,
      cleanupMs: 30_000,
    })
  })
  it.each([
    { acquisitionMs: 0 },
    { initializationMs: 60_001 },
    { acknowledgementMs: 60_001 },
    { completionMs: 900_001 },
    { cleanupMs: 1.2 },
    { acquisitionMs: 60_000, initializationMs: 30_000, requiredMcpMs: 1, cleanupMs: 1 },
  ])('rejects invalid local bounds %#', patch => {
    expect(() => captureOfflineProviderTimeouts({ ...captureOfflineProviderTimeouts(), ...patch })).toThrow()
  })
  it.each([
    null,
    { ...completion(), status: 'NATIVE_READY' },
    { ...completion(), calls: [] },
    { ...completion(), calls: [completion().calls[0], completion().calls[0]] },
    { ...completion(), calls: [{ ...completion().calls[0], prompt: 'unbounded' }] },
    { ...completion(), raw: 'forbidden' },
  ])('rejects malformed completion/correlation %#', value => {
    expect(() => parseOfflineProviderCompletion(value)).toThrow()
  })
  it('rejects oversized completion arguments before publication', () => {
    expect(() =>
      parseOfflineProviderCompletion({
        ...completion(),
        calls: [{ ...completion().calls[0], arguments: { data: 'x'.repeat(1_048_576) } }],
      }),
    ).toThrow('Invalid offline completion')
  })
  it('deeply captures JSON without exposing a mutable envelope or capability', () => {
    const source = [{ type: 'text', value: { text: 'original' } }]
    const value = captureOfflineProviderJson(source)
    source[0].value.text = 'changed'
    expect(value[0].value.text).toBe('original')
    expect(Object.isFrozen(value[0].value)).toBe(true)
    expect(() => captureOfflineProviderJson({ callback: () => undefined })).toThrow('Invalid offline JSON')
  })
})
