import { describe, expect, it } from 'vitest'

import { environmentJsonFailures, environmentSchemaFailures } from './environment-secret-policy'

describe('environment secret policy', () => {
  it('reports value columns, unresolved legacy rows, and old schema fields', () => {
    expect(environmentSchemaFailures([{ name: 'password' }], 2, '  password String?')).toEqual([
      'Environment table still has a password column',
      '2 environment row(s) remain disabled with unresolved legacy credentials',
      'Prisma schema still declares Environment.password',
    ])
    expect(environmentSchemaFailures([{ name: 'passwordEnvironmentVariable' }], 0, 'model Environment {}')).toEqual([])
  })

  it('accepts reference-only JSON and rejects value fields, invalid references, and sentinels', () => {
    expect(
      environmentJsonFailures('environments.json', '{"local":{"passwordEnvironmentVariable":"APP_PASSWORD"}}'),
    ).toEqual([])
    expect(
      environmentJsonFailures(
        'environments.json',
        '{"local":{"password":"known-fixture-secret-sentinel","passwordEnvironmentVariable":42}}',
      ),
    ).toEqual([
      'environments.json:local contains a password field',
      'environments.json:local has a non-string passwordEnvironmentVariable',
      'environments.json contains the secret sentinel',
    ])
  })
})
