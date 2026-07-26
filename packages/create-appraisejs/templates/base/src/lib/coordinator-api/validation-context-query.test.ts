import { describe, expect, it } from 'vitest'

import { parseValidationResourceTypes } from './validation-context-query'

describe('validation context query', () => {
  it('accepts the exact public resource type vocabulary', () => {
    expect(
      parseValidationResourceTypes(
        new URLSearchParams(
          'resourceTypes=modules,testSuites,testCases,stepDefinitions,locatorGroups,locators,environments',
        ),
      ),
    ).toEqual(['modules', 'testSuites', 'testCases', 'stepDefinitions', 'locatorGroups', 'locators', 'environments'])
  })

  it('rejects unsupported singular and operation resource types', () => {
    expect(() =>
      parseValidationResourceTypes(new URLSearchParams('resourceTypes=environment,operation,locator')),
    ).toThrow("Expected 'modules' | 'testSuites' | 'testCases'")
  })
})
