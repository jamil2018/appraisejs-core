import { describe, expect, it } from 'vitest'

import {
  getActionErrorMessage,
  getModuleFormParentId,
  getModuleParentOptions,
  getModuleTableRows,
} from './module-helpers'

const moduleRow = {
  id: 'module-1',
  name: 'Payments',
  parentId: null,
  parent: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

describe('module helpers', () => {
  it('filters action data to valid module table rows', () => {
    expect(getModuleTableRows([moduleRow, { id: 'bad-row', name: 'Missing dates' }])).toEqual([moduleRow])
    expect(getModuleTableRows(undefined)).toEqual([])
  })

  it('builds selectable parent options and excludes the edited module', () => {
    expect(
      getModuleParentOptions(
        [
          moduleRow,
          {
            ...moduleRow,
            id: 'module-2',
            name: 'Checkout',
          },
        ],
        'module-1',
      ),
    ).toEqual([{ id: 'module-2', name: 'Checkout' }])
  })

  it('falls back to the root module parent id and formats action errors', () => {
    expect(getModuleFormParentId(null)).toBe('00000000-0000-0000-0000-000000000000')
    expect(getModuleFormParentId('module-1')).toBe('module-1')
    expect(getActionErrorMessage({ status: 400, error: 'Nope' })).toBe('Nope')
    expect(getActionErrorMessage({ status: 400, message: 'Try again' })).toBe('Try again')
    expect(getActionErrorMessage({ status: 500 })).toBe('Unable to save module.')
  })
})
