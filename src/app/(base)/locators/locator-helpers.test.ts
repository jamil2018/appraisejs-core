import { describe, expect, it } from 'vitest'

import { getLocatorTableRows } from './locator-helpers'

describe('locator helpers', () => {
  it('keeps locator rows when the list payload only includes locator group name', () => {
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
            name: 'Checkout',
          },
          conflicts: [
            {
              id: 'conflict-1',
            },
          ],
        },
      ]),
    ).toHaveLength(1)
  })
})
