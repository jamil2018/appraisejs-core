import { describe, expect, it } from 'vitest'
import {
  normalizeDiscoveryAuthTransitPolicyJson,
  parseDiscoveryAuthTransitPolicy,
} from './discovery-auth-transit-policy'

const policy = {
  schemaVersion: 'appraise.discovery-auth-transit/v1',
  flows: [
    {
      flowId: 'human-login',
      rules: [
        {
          documentOrigin: '$TARGET',
          destinationOrigin: 'https://LOGIN.example.test/',
          path: { match: 'EXACT', value: '/authorize' },
          methods: ['POST', 'GET', 'GET'],
          requestKinds: ['DOCUMENT', 'DOCUMENT'],
        },
      ],
      returns: [{ fromOrigin: 'https://login.example.test', targetPath: '/account', methods: ['POST', 'GET'] }],
    },
  ],
}

describe('Discovery auth transit policy', () => {
  it('normalizes exact IdP origins and method/request-kind duplicates into the persisted policy', () => {
    const normalized = normalizeDiscoveryAuthTransitPolicyJson(JSON.stringify(policy), 'https://target.example.test')
    expect(normalized).toContain('https://login.example.test')
    expect(normalized).toContain('"methods":["GET","POST"]')
  })

  it.each([
    [
      'target duplication',
      {
        ...policy,
        flows: [
          {
            ...policy.flows[0],
            returns: [{ fromOrigin: 'https://target.example.test', targetPath: '/account', methods: ['GET'] }],
          },
        ],
      },
    ],
    [
      'IdP path',
      {
        ...policy,
        flows: [
          {
            ...policy.flows[0],
            rules: [{ ...policy.flows[0].rules[0], destinationOrigin: 'https://login.example.test/path' }],
          },
        ],
      },
    ],
    [
      'encoded path ambiguity',
      {
        ...policy,
        flows: [
          { ...policy.flows[0], rules: [{ ...policy.flows[0].rules[0], path: { match: 'EXACT', value: '/%2f' } }] },
        ],
      },
    ],
  ])('rejects %s', (_name, value) => {
    expect(() => parseDiscoveryAuthTransitPolicy(value, 'https://target.example.test')).toThrow()
  })
})
