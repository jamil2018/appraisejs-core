import { describe, expect, it } from 'vitest'

import {
  coordinatorOperationRegistry,
  createCoordinatorOperationRegistry,
  type CoordinatorMethod,
} from './coordinator-operation-registry'

describe('coordinator operation registry', () => {
  it.each([
    ['GET', ['diagnostic'], 'diagnostic'],
    ['GET', ['quality', 'plans', 'qlp_example', 'requirements'], 'quality-read'],
    ['GET', ['quality', 'assessments', 'assessment-1'], 'quality-read'],
    ['GET', ['step-definitions', 'search'], 'step-definitions-read'],
    ['GET', ['environments'], 'environment-read'],
    ['POST', ['diagnostic', 'preflight'], 'diagnostic-preflight-write'],
    ['POST', ['quality', 'assessments'], 'quality-write'],
    ['POST', ['quality', 'assessment-runs'], 'quality-write'],
    ['POST', ['quality', 'assessment-prepare-runs'], 'quality-write'],
    ['POST', ['environments', 'ensure'], 'environment-write'],
    ['POST', ['locators', 'ensure'], 'locator-write'],
    [
      'POST',
      ['step-definitions', 'drafts', '7aee2494-01ac-45c4-ada7-528eaba27fe1', 'publish'],
      'step-definitions-write',
    ],
  ] satisfies Array<[CoordinatorMethod, string[], string]>)('resolves %s /%s', (method, operation, expected) => {
    expect(coordinatorOperationRegistry.resolve(method, operation)).toBe(expected)
  })

  it.each([
    ['GET', []],
    ['GET', ['providers']],
    ['POST', ['diagnostic']],
    ['POST', ['unknown-surface', 'run-1']],
    ['PUT', ['quality', 'plans', 'quality-plan-1']],
  ] satisfies Array<[CoordinatorMethod, string[]]>)('fails closed for %s /%s', (method, operation) => {
    expect(() => coordinatorOperationRegistry.resolve(method, operation)).toThrow('Coordinator API operation not found')
  })

  it('rejects duplicate method and path patterns', () => {
    expect(() =>
      createCoordinatorOperationRegistry([
        { id: 'first', method: 'GET', pattern: ['quality'] },
        { id: 'second', method: 'GET', pattern: ['quality'] },
      ]),
    ).toThrow('Duplicate coordinator operation pattern')
  })
})
