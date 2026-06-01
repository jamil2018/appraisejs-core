import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  buildNodeFormSubmitValue,
  createInitialParametersForTemplateStep,
  getGherkinPreview,
  getSelectedTemplateIcon,
  getSelectedTemplateStep,
  getSelectedTemplateStepParams,
  validateNodeFormValues,
} from './node-form-helpers'

describe('node-form helpers', () => {
  const templateSteps = [
    {
      id: 'step-1',
      name: 'Click',
      icon: TemplateStepIcon.MOUSE,
      signature: 'click {string}',
      type: TemplateStepType.ACTION,
    },
    {
      id: 'step-2',
      name: 'Check',
      icon: TemplateStepIcon.VALIDATION,
      signature: 'see {string}',
      type: TemplateStepType.ASSERTION,
    },
  ] as never

  const templateStepParams = [
    {
      id: 'param-1',
      name: 'target',
      type: StepParameterType.STRING,
      order: 1,
      templateStepId: 'step-1',
    },
    {
      id: 'param-2',
      name: 'expected',
      type: StepParameterType.STRING,
      order: 1,
      templateStepId: 'step-2',
    },
  ] as never

  it('selects template steps and related params', () => {
    expect(getSelectedTemplateStep(templateSteps, 'step-1')?.name).toBe('Click')
    expect(getSelectedTemplateStepParams(templateStepParams, 'step-2')).toEqual([
      expect.objectContaining({ name: 'expected' }),
    ])
  })

  it('creates initial parameters and gherkin previews', () => {
    const parameters = createInitialParametersForTemplateStep(
      getSelectedTemplateStepParams(templateStepParams, 'step-1'),
    )

    expect(parameters).toEqual([
      {
        name: 'target',
        value: '',
        type: StepParameterType.STRING,
        order: 1,
      },
    ])
    expect(
      getGherkinPreview(templateSteps[0], [
        { name: 'target', value: 'Submit', type: StepParameterType.STRING, order: 1 },
      ]),
    ).toBe('When click "Submit"')
  })

  it('validates and shapes submit payloads', () => {
    expect(validateNodeFormValues('', '')).toMatchObject({ success: false })
    expect(getSelectedTemplateIcon(templateSteps[0])).toBe(TemplateStepIcon.MOUSE)

    expect(
      buildNodeFormSubmitValue(
        { label: 'Submit click' },
        [{ name: 'target', value: 'Submit', type: StepParameterType.STRING, order: 1 }],
        'When click "Submit"',
        'step-1',
      ),
    ).toEqual({
      label: 'Submit click',
      parameters: [{ name: 'target', value: 'Submit', type: StepParameterType.STRING, order: 1 }],
      gherkinStep: 'When click "Submit"',
      templateStepId: 'step-1',
    })
  })
})
