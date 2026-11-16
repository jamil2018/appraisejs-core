import { describe, expect, it, vi } from 'vitest'
import { captureNativeRequestSnapshot } from './native-request-snapshot'

describe('inert native request snapshot', () => {
  it('retains JSON-native plain/null-prototype records and arrays without caller references', () => {
    const nested = Object.assign(Object.create(null), { text: 'approved', type: 'text' })
    const original = { input: [nested], nullable: null, count: 1, enabled: false }
    const snapshot = captureNativeRequestSnapshot(original)
    expect(JSON.stringify(snapshot)).toBe(JSON.stringify(original))
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.input)).toBe(true)
    nested.text = 'mutated'
    expect(JSON.stringify(snapshot)).toContain('approved')
    expect(JSON.stringify(snapshot)).not.toContain('mutated')
  })
  it.each(['root-serializer', 'nested-serializer', 'root-getter', 'nested-getter'])(
    'rejects %s without invoking caller code',
    mode => {
      const hook = vi.fn(() => ({ sandbox: 'danger-full-access' }))
      const original: Record<string, unknown> = { sandbox: 'read-only', input: [{ type: 'text', text: 'approved' }] }
      const target = mode.startsWith('nested') ? (original.input as Record<string, unknown>[])[0] : original
      if (mode.endsWith('serializer')) Object.defineProperty(target, 'toJSON', { value: hook })
      else Object.defineProperty(target, 'private', { get: hook, enumerable: true })
      expect(() => captureNativeRequestSnapshot(original)).toThrow(/Inert native/)
      expect(hook).not.toHaveBeenCalled()
    },
  )
  it.each([new Date(), new String('x'), /x/, { input: [undefined] }, { value: Infinity }, { value: () => 1 }])(
    'rejects non-JSON/unsupported values without coercion',
    value => {
      expect(() => captureNativeRequestSnapshot(value as Record<string, unknown>)).toThrow()
    },
  )
  it('rejects cycles, symbol keys and hidden fields', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(() => captureNativeRequestSnapshot(cycle)).toThrow()
    expect(() => captureNativeRequestSnapshot({ [Symbol('private')]: 1 })).toThrow()
    expect(() => captureNativeRequestSnapshot(Object.defineProperty({}, 'private', { value: 1 }))).toThrow()
  })
})

describe('non-trapping and inherited-serializer snapshot boundary', () => {
  it.each(['root', 'nested', 'array', 'revoked'] as const)('rejects %s Proxy before reflection', location => {
    const trap = vi.fn(() => {
      throw new Error('caller trap executed')
    })
    let input: Record<string, unknown>
    if (location === 'revoked') {
      const revoked = Proxy.revocable({}, { ownKeys: trap })
      revoked.revoke()
      input = revoked.proxy
    } else {
      const proxy = new Proxy(location === 'array' ? [] : {}, {
        ownKeys: trap,
        getPrototypeOf: trap,
        getOwnPropertyDescriptor: trap,
      })
      input = location === 'root' ? (proxy as Record<string, unknown>) : { nested: proxy }
    }
    expect(() => captureNativeRequestSnapshot(input)).toThrow(/Inert native/)
    expect(trap).not.toHaveBeenCalled()
  })
  it('retains checked array values without invoking an inherited serializer', () => {
    const original = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
    const serializer = vi.fn(() => [{ type: 'text', text: 'substituted' }])
    let encoded = '',
      snapshot!: Record<string, unknown>
    try {
      Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value: serializer })
      snapshot = captureNativeRequestSnapshot({ input: [{ type: 'text', text: 'approved' }] })
      encoded = JSON.stringify(snapshot)
    } finally {
      if (original) Object.defineProperty(Array.prototype, 'toJSON', original)
      else Reflect.deleteProperty(Array.prototype, 'toJSON')
    }
    expect(encoded).toBe('{"input":[{"type":"text","text":"approved"}]}')
    expect(serializer).not.toHaveBeenCalled()
    expect(Array.isArray(snapshot.input)).toBe(true)
    expect(Object.isFrozen(snapshot.input)).toBe(true)
    expect(Object.getOwnPropertyDescriptor(snapshot.input, 'toJSON')).toMatchObject({
      value: undefined,
      enumerable: false,
      writable: false,
    })
  })
})
