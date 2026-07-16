import { describe, expect, it } from 'vitest'

import {
  coordinatorOperationRegistry,
  createCoordinatorOperationRegistry,
  type CoordinatorMethod,
} from './coordinator-operation-registry'

describe('coordinator operation registry', () => {
  it.each([
    ['GET', ['diagnostic'], 'diagnostic'],
    ['GET', ['plans', 'pln_example'], 'plan-read'],
    ['GET', ['plans', 'pln_example', 'validations', 'draft', 'context'], 'plan-validations-read'],
    ['POST', ['plans', 'pln_example', 'implementation', 'validations', 'start'], 'plan-implementation-write'],
    ['POST', ['delegations', '7aee2494-01ac-45c4-ada7-528eaba27fe1', 'revoke'], 'delegation-revoke'],
    ['PUT', ['plans', 'pln_example'], 'plan-revise'],
  ] satisfies Array<[CoordinatorMethod, string[], string]>)('resolves %s /%s', (method, operation, expected) => {
    expect(coordinatorOperationRegistry.resolve(method, operation)).toBe(expected)
  })

  it.each([
    ['GET', []],
    ['GET', ['plans', 'pln_example', 'unknown']],
    ['POST', ['diagnostic']],
    ['PUT', ['plans']],
  ] satisfies Array<[CoordinatorMethod, string[]]>)('fails closed for %s /%s', (method, operation) => {
    expect(() => coordinatorOperationRegistry.resolve(method, operation)).toThrow('Coordinator API operation not found')
  })

  it('rejects duplicate method and path patterns', () => {
    expect(() =>
      createCoordinatorOperationRegistry([
        { id: 'first', method: 'GET', pattern: ['plans'] },
        { id: 'second', method: 'GET', pattern: ['plans'] },
      ]),
    ).toThrow('Duplicate coordinator operation pattern')
  })
})
