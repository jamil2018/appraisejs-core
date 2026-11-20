import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  discoveryControlPresenceExpression,
  discoveryControlPresenceFacts,
  parseDiscoveryControlPresence,
} from './quality-journey-discovery-control-presence'

function element(kind: 'email' | 'password' | 'submit' | 'heading' | 'other', visible = true) {
  return {
    get value(): never {
      throw new Error('Sensitive value must not be read')
    },
    get textContent(): never {
      throw new Error('Target text must not be read')
    },
    get innerHTML(): never {
      throw new Error('Target markup must not be read')
    },
    checkVisibility: () => visible,
    matches: (selector: string) =>
      kind === 'email'
        ? selector === 'input[type="email"]'
        : kind === 'password'
          ? selector === 'input[type="password"]'
          : kind === 'submit'
            ? selector.startsWith('button:not')
            : kind === 'heading'
              ? selector === 'h1,h2,h3,h4,h5,h6'
              : false,
  }
}
function observe(elements: ReturnType<typeof element>[]) {
  let index = 0
  return runInNewContext(discoveryControlPresenceExpression, {
    NodeFilter: { SHOW_ELEMENT: 1 },
    document: {
      documentElement: elements[0] ?? null,
      createTreeWalker: () => ({ currentNode: elements[0], nextNode: () => elements[++index] ?? null }),
    },
  })
}

describe('bounded non-sensitive Discovery control presence', () => {
  it('returns fixed category booleans and fact strings without reading values, text or markup', () => {
    const presence = parseDiscoveryControlPresence(
      observe([element('email'), element('password'), element('submit'), element('heading')]),
    )
    expect(presence).toEqual({ emailInput: true, passwordInput: true, submitControl: true, heading: true })
    expect(discoveryControlPresenceFacts(presence)).toEqual([
      'Appraise observed a visible email input in the captured target document.',
      'Appraise observed a visible password input in the captured target document.',
      'Appraise observed a visible submit control in the captured target document.',
      'Appraise observed a visible heading in the captured target document.',
    ])
  })
  it('does not claim hidden controls or inspect beyond the bounded element budget', () => {
    expect(discoveryControlPresenceFacts(parseDiscoveryControlPresence(observe([element('password', false)])))).toEqual(
      [],
    )
    expect(
      parseDiscoveryControlPresence(observe([...Array.from({ length: 512 }, () => element('other')), element('email')]))
        .emailInput,
    ).toBe(false)
    expect(discoveryControlPresenceFacts(parseDiscoveryControlPresence(observe([])))).toEqual([])
  })
  it('rejects remote strings, extra properties and unbounded free-form browser content', () => {
    expect(() =>
      parseDiscoveryControlPresence({
        emailInput: true,
        passwordInput: false,
        submitControl: true,
        heading: true,
        value: 'private-canary',
      }),
    ).toThrow()
    expect(() =>
      parseDiscoveryControlPresence({
        emailInput: 'private-canary',
        passwordInput: false,
        submitControl: true,
        heading: true,
      }),
    ).toThrow()
  })
})
