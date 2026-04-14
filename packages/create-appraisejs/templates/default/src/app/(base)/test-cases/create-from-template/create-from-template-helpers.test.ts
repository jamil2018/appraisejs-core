import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  getConvertedTemplateTestCaseData,
  getFieldErrorMessage,
  getTemplateSelectionOptions,
  getTemplateTestCaseWithSteps,
} from './create-from-template-helpers'

describe('create-from-template helpers', () => {
  it('formats field errors and selection options for the route form', () => {
    expect(getFieldErrorMessage('Template test case is required')).toBe('Template test case is required')
    expect(getFieldErrorMessage({ message: 'Missing selection' })).toBe('Missing selection')

    expect(
      getTemplateSelectionOptions([
        { id: 'template-1', name: 'Login flow' },
        { id: 'template-2', name: 'Checkout flow' },
      ]),
    ).toEqual([
      { label: 'Login flow', value: 'template-1' },
      { label: 'Checkout flow', value: 'template-2' },
    ])
  })

  it('narrows template test cases with steps and converts valid template data', () => {
    const templateTestCase = getTemplateTestCaseWithSteps({
      id: 'template-1',
      name: 'Login flow',
      description: 'Reusable login flow',
      steps: [
        {
          id: 'step-row-1',
          order: 1,
          label: 'Fill email',
          gherkinStep: 'fill email',
          icon: TemplateStepIcon.INPUT,
          templateStepId: 'template-step-1',
          parameters: [
            {
              id: 'param-1',
              name: 'email',
              defaultValue: 'qa@appraise.dev',
              type: StepParameterType.STRING,
              order: 1,
              templateStepId: 'template-step-1',
            },
          ],
        },
      ],
    })

    expect(templateTestCase).not.toBeNull()

    const conversion = getConvertedTemplateTestCaseData(templateTestCase!)
    expect(conversion.error).toBeNull()
    expect(conversion.convertedData).toEqual({
      title: 'Login flow',
      description: 'Reusable login flow',
      testSuiteIds: [],
      nodesOrder: {
        'node-0': {
          order: 1,
          label: 'Fill email',
          gherkinStep: 'fill email',
          icon: TemplateStepIcon.INPUT,
          parameters: [
            {
              name: 'email',
              value: 'qa@appraise.dev',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          templateStepId: 'template-step-1',
        },
      },
    })
  })

  it('rejects invalid converted template data', () => {
    const invalidTemplateTestCase = getTemplateTestCaseWithSteps({
      id: 'template-1',
      name: 'No steps',
      description: null,
      steps: [],
    })

    const conversion = getConvertedTemplateTestCaseData(invalidTemplateTestCase!)
    expect(conversion.convertedData).toBeNull()
    expect(conversion.error).toBe('At least one step is required')
  })
})
