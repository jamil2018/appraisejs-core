import { StepParameterType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { toNodeOrderMap, toTemplateTestCaseNodeOrderMap } from './flow-host-helpers'

describe('flow host helpers', () => {
  it('converts template-test-case node parameters into runtime values', () => {
    expect(
      toNodeOrderMap({
        'node-1': {
          order: 1,
          label: 'Click button',
          parameters: [
            {
              name: 'target',
              defaultValue: 'Submit',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          templateStepId: 'step-1',
        },
      }),
    ).toEqual({
      'node-1': {
        order: 1,
        label: 'Click button',
        parameters: [
          {
            name: 'target',
            value: 'Submit',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        templateStepId: 'step-1',
      },
    })
  })

  it('converts runtime node parameters into template default values', () => {
    expect(
      toTemplateTestCaseNodeOrderMap({
        'node-1': {
          order: 1,
          label: 'Fill field',
          parameters: [
            {
              name: 'value',
              value: 'email@example.com',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          templateStepId: 'step-2',
        },
      }),
    ).toEqual({
      'node-1': {
        order: 1,
        label: 'Fill field',
        parameters: [
          {
            name: 'value',
            defaultValue: 'email@example.com',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        templateStepId: 'step-2',
      },
    })
  })
})
