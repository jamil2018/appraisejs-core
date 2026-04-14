import { StepParameterType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  formatDynamicParameterValues,
  getDynamicParameterInitialValues,
  getInitialSelectedLocatorGroups,
  getLocatorsForGroup,
  validateDynamicParameters,
} from './dynamic-parameters-helpers'

describe('dynamic-parameters helpers', () => {
  const templateStepParams = [
    { name: 'count', type: StepParameterType.NUMBER, order: 1 },
    { name: 'title', type: StepParameterType.STRING, order: 2 },
    { name: 'startDate', type: StepParameterType.DATE, order: 3 },
    { name: 'enabled', type: StepParameterType.BOOLEAN, order: 4 },
    { name: 'target', type: StepParameterType.LOCATOR, order: 5 },
  ] as never

  it('builds initial values from persisted parameter input', () => {
    const values = getDynamicParameterInitialValues(templateStepParams, [
      { name: 'count', value: '4', type: StepParameterType.NUMBER, order: 1 },
      { name: 'enabled', value: 'true', type: StepParameterType.BOOLEAN, order: 4 },
      { name: 'target', value: 'loginButton', type: StepParameterType.LOCATOR, order: 5 },
    ])

    expect(values.count).toBe(4)
    expect(values.enabled).toBe(true)
    expect(values.target).toBe('loginButton')
    expect(values.title).toBe('')
  })

  it('derives locator groups from selected locator names', () => {
    const selectedGroups = getInitialSelectedLocatorGroups(
      templateStepParams,
      [{ name: 'target', value: 'loginButton', type: StepParameterType.LOCATOR, order: 5 }],
      [{ id: 'locator-1', name: 'loginButton', locatorGroupId: 'group-1' }] as never,
    )

    expect(selectedGroups).toEqual({ target: 'group-1' })
    expect(getLocatorsForGroup([{ id: 'locator-1', locatorGroupId: 'group-1' }] as never, 'group-1')).toHaveLength(1)
  })

  it('validates required locator and scalar fields when default values are disabled', () => {
    const errors = validateDynamicParameters(
      templateStepParams,
      {
        count: 0,
        title: '',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        enabled: false,
        target: '',
      },
      {},
      false,
    )

    expect(errors).toEqual({
      count: 'This field is required',
      title: 'This field is required',
      target: 'Locator group is required',
    })
  })

  it('formats dynamic values into the submit shape', () => {
    const values = formatDynamicParameterValues(templateStepParams, {
      count: 5,
      title: 'Smoke',
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      enabled: true,
      target: 'loginButton',
    })

    expect(values).toEqual([
      expect.objectContaining({ name: 'count', value: '5' }),
      expect.objectContaining({ name: 'title', value: 'Smoke' }),
      expect.objectContaining({ name: 'startDate', value: expect.any(String) }),
      expect.objectContaining({ name: 'enabled', value: 'true' }),
      expect.objectContaining({ name: 'target', value: 'loginButton' }),
    ])
  })
})
