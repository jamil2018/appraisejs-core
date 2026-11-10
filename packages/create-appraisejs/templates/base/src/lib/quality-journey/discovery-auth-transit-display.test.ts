import { describe, expect, it } from 'vitest'
import { identityProviderOriginsFromDiscoveryAuthTransitPolicy } from './discovery-auth-transit-display'
import { discoveryAuthTransitPolicyHash } from './discovery-auth-transit-policy'

describe('Discovery auth transit display origins', () => {
  it.each([null, undefined, '', 'not JSON', 'null', '{}', '{"flows":null}', '{"flows":[{}]}'])(
    'returns an empty list for empty, unparseable or throwing shape %s',
    value => {
      expect(identityProviderOriginsFromDiscoveryAuthTransitPolicy(value)).toEqual([])
    },
  )

  it('deduplicates rules and returns across flows, omits the target and sorts origins', () => {
    const value = JSON.stringify({
      flows: [
        {
          rules: [
            { documentOrigin: '$TARGET', destinationOrigin: 'https://z.example.test' },
            { documentOrigin: 'https://a.example.test', destinationOrigin: 'https://z.example.test' },
          ],
          returns: [{ fromOrigin: 'https://a.example.test' }],
        },
        {
          rules: [{ documentOrigin: 'https://b.example.test', destinationOrigin: '$TARGET' }],
          returns: [{ fromOrigin: 'https://z.example.test' }, { fromOrigin: '$TARGET' }],
        },
      ],
    })
    expect(identityProviderOriginsFromDiscoveryAuthTransitPolicy(value)).toEqual([
      'https://a.example.test',
      'https://b.example.test',
      'https://z.example.test',
    ])
  })

  it('preserves raw strings and default sorting without validating or normalizing the policy', () => {
    const value = JSON.stringify({
      schemaVersion: 'display-only-shape',
      flows: [
        {
          rules: [{ documentOrigin: ' https://z.example.test/ ', destinationOrigin: 'https://LOGIN.example.test/' }],
          returns: [{ fromOrigin: 'not an origin' }, { fromOrigin: 'https://login.example.test' }],
        },
      ],
    })
    expect(identityProviderOriginsFromDiscoveryAuthTransitPolicy(value)).toEqual([
      ' https://z.example.test/ ',
      'https://LOGIN.example.test/',
      'https://login.example.test',
      'not an origin',
    ])
  })
})

describe('Discovery auth transit stored-string hash compatibility', () => {
  it.each([
    [null, '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'],
    [undefined, '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'],
    ['null', '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'],
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['{}', '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'],
    [' {} ', '557f9139185990e294bfa33b7425d6a49528c24cd05917b00424353226b8b3fb'],
  ])('hashes the exact stored value %s', (value, expected) => {
    expect(discoveryAuthTransitPolicyHash(value)).toBe(`sha256:${expected}`)
  })
})
