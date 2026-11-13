import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createTrustedManagedWorkerOfflineComposition } from './trusted-managed-worker-offline-composition.js'
import type { AttemptScopedWorkerProfile } from './managed-worker-server.js'

const toolNames = {
  REQUIREMENT_ANALYZER: ['quality_journey_analysis_get', 'quality_journey_analysis_submit'],
  SCOUT: ['quality_journey_discovery_get', 'quality_journey_target_observation_submit'],
  RESOURCE_EXPLORER: ['quality_journey_discovery_get', 'quality_journey_resource_resolution_submit'],
  TEST_SCENARIO_DESIGNER: ['quality_journey_scenarios_get', 'quality_journey_scenarios_submit'],
  AUTOMATOR: ['quality_journey_automation_context_get', 'quality_journey_automation_materialize'],
  TRIAGER: ['quality_journey_triage_get', 'quality_journey_triage_evidence_read', 'quality_journey_triage_submit'],
} as const
const closes: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(closes.splice(0).map(close => close()))
})
function hash(value: unknown): string {
  const canonical = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(canonical)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map(key => [key, canonical((input as Record<string, unknown>)[key])]),
          )
        : input
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`
}
function profile(role: keyof typeof toolNames = 'REQUIREMENT_ANALYZER'): AttemptScopedWorkerProfile {
  const subject = {
    role,
    tools: toolNames[role].map(name => ({
      name,
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
    })),
  }
  return { ...subject, contractDigest: hash(subject) }
}
async function fixture(role: keyof typeof toolNames = 'REQUIREMENT_ANALYZER', patch: Record<string, unknown> = {}) {
  const input = profile(role)
  const composed = await createTrustedManagedWorkerOfflineComposition({
    provenance: 'OFFLINE_SYNTHETIC',
    profile: input,
    expectedProfileDigest: input.contractDigest,
    ...patch,
  })
  closes.push(composed.close)
  return { composed, input, toolName: toolNames[role].at(-1)! }
}
function gate<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}

describe('managed worker in-memory offline composition', () => {
  it.each(Object.keys(toolNames) as Array<keyof typeof toolNames>)(
    'preserves the entire opaque %s canonical result and separates correlation from acceptance',
    async role => {
      const { composed, input, toolName } = await fixture(role)
      let calls = 0
      const raw = { result: { nested: ['canonical', 1] }, receipt: { opaqueGatewayReceipt: true }, synthetic: true }
      const actual = await composed.exchange(toolName, { value: 'proposal' }, async () => {
        calls++
        return raw
      })
      expect(actual).toEqual(raw)
      expect(calls).toBe(1)
      const snapshot = composed.snapshot()
      expect(snapshot).toMatchObject({
        provenance: 'OFFLINE_SYNTHETIC',
        runtimeQualified: false,
        dispatchAllowed: false,
        role,
        profileDigest: input.contractDigest,
        state: 'READY',
        calls: [{ toolName, callbackCount: 1, argumentsDigest: hash({ value: 'proposal' }), outputDigest: hash(raw) }],
      })
      expect(snapshot.calls[0]).not.toHaveProperty('accepted')
      expect(JSON.stringify(snapshot)).not.toContain('opaqueGatewayReceipt')
      expect(Object.isFrozen(snapshot.calls[0])).toBe(true)
    },
  )
  it('refuses schema extras and cross-role tools before canonical entry', async () => {
    const { composed, toolName } = await fixture()
    let calls = 0
    const canonical = async () => {
      calls++
      return { value: true }
    }
    await expect(
      composed.exchange(toolName, { value: 'proposal', principal: 'forged' }, canonical),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    await expect(
      composed.exchange('quality_journey_triage_submit', { value: 'proposal' }, canonical),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    expect(calls).toBe(0)
    expect(composed.snapshot().calls).toHaveLength(0)
  })
  it('captures caller profile and schemas rather than sharing mutable arguments', async () => {
    const { composed, input, toolName } = await fixture()
    ;(input.tools[0] as { inputSchema: unknown }).inputSchema = { type: 'object', additionalProperties: true }
    const argument = { value: 'captured' },
      pending = gate<unknown>()
    const flight = composed.exchange(toolName, argument, () => pending.promise)
    argument.value = 'mutated'
    pending.resolve({ done: true })
    await expect(flight).resolves.toEqual({ done: true })
    expect(composed.snapshot().calls[0].argumentsDigest).toBe(hash({ value: 'captured' }))
  })
  it('refuses changed profile hashes and malformed bounds at construction', async () => {
    const input = profile()
    await expect(
      createTrustedManagedWorkerOfflineComposition({
        provenance: 'OFFLINE_SYNTHETIC',
        profile: input,
        expectedProfileDigest: `sha256:${'0'.repeat(64)}`,
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    await expect(fixture('REQUIREMENT_ANALYZER', { maxCalls: 17 })).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('refuses overlap and reentrant calls without invoking a second callback', async () => {
    const { composed, toolName } = await fixture()
    let extra = 0
    await composed.exchange(toolName, { value: 'one' }, async () => {
      await expect(
        composed.exchange(toolName, { value: 'two' }, async () => {
          extra++
          return {}
        }),
      ).rejects.toMatchObject({ disposition: 'REFUSED' })
      return { done: true }
    })
    expect(extra).toBe(0)
    expect(composed.snapshot().calls[0].callbackCount).toBe(1)
  })
  it('fences a rejected callback without exposing raw errors or retrying it', async () => {
    const { composed, toolName } = await fixture()
    let calls = 0
    await expect(
      composed.exchange(toolName, { value: 'one' }, async () => {
        calls++
        throw new Error('sensitive-canonical-message')
      }),
    ).rejects.toMatchObject({ disposition: 'UNKNOWN', message: 'Managed offline composition unknown.' })
    await expect(
      composed.exchange(toolName, { value: 'two' }, async () => {
        calls++
        return {}
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    expect(calls).toBe(1)
    expect(JSON.stringify(composed.snapshot())).not.toContain('sensitive-canonical-message')
  })
  it('bounds a pending callback and ignores late settlement in its immutable snapshot', async () => {
    const { composed, toolName } = await fixture('REQUIREMENT_ANALYZER', { timeoutMs: 10 })
    const pending = gate<unknown>()
    await expect(composed.exchange(toolName, { value: 'one' }, () => pending.promise)).rejects.toMatchObject({
      disposition: 'UNKNOWN',
    })
    const snapshot = composed.snapshot()
    pending.resolve({ late: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(composed.snapshot()).toEqual(snapshot)
    expect(snapshot.calls[0]).toMatchObject({ callbackCount: 1, outputDigest: null })
  })
  it('enforces call and result ceilings without making a second canonical call', async () => {
    const { composed, toolName } = await fixture('REQUIREMENT_ANALYZER', { maxCalls: 1, maxResultBytes: 128 })
    let calls = 0
    await expect(
      composed.exchange(toolName, { value: 'one' }, async () => {
        calls++
        return { huge: 'x'.repeat(200) }
      }),
    ).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    await expect(
      composed.exchange(toolName, { value: 'two' }, async () => {
        calls++
        return {}
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    expect(calls).toBe(1)
  })
  it('synchronously closes admission and memoizes original close, including a pending callback', async () => {
    const { composed, toolName } = await fixture()
    const pending = gate<unknown>()
    const flight = composed.exchange(toolName, { value: 'one' }, () => pending.promise)
    await new Promise(resolve => setTimeout(resolve, 0))
    const close = composed.close()
    expect(composed.close()).toBe(close)
    expect(composed.snapshot().state).toBe('CLOSED')
    await expect(composed.exchange(toolName, { value: 'two' }, async () => ({}))).rejects.toMatchObject({
      disposition: 'REFUSED',
    })
    await expect(flight).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    pending.resolve({ late: true })
    await close
    expect(composed.snapshot().state).toBe('CLOSED')
  })
})
