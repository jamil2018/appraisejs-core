import { describe, expect, it } from 'vitest'

import { getLocatorTableRows } from './locator-helpers'

describe('locator helpers', () => {
  it('narrows locator table rows with groups and conflicts', () => {
    expect(
      getLocatorTableRows([
        {
          id: 'locator-1',
          name: 'submitButton',
          value: '#submit',
          locatorGroupId: 'group-1',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          locatorGroup: {
            id: 'group-1',
            name: 'Checkout',
            route: '/checkout',
            moduleId: 'module-1',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          conflicts: [
            {
              id: 'conflict-1',
              locatorId: 'locator-1',
              originalSelector: '#submit',
              resolvedSelector: '#submit-button',
              status: 'RESOLVED',
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
          ],
        },
      ]),
    ).toHaveLength(1)
  })
})
