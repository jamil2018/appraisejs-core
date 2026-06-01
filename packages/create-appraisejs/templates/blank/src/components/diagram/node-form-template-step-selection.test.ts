import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { getParameterPreviewUpdates, getTemplateStepSelectionUpdates } from './node-form-template-step-selection'

describe('node-form-template-step-selection', () => {
  const templateSteps = [
    {
      id: 'step-1',
      name: 'Click',
      icon: TemplateStepIcon.MOUSE,
      signature: 'click {string}',
      type: TemplateStepType.ACTION,
    } as never,
  ]

  const templateStepParams = [
    {
      id: 'param-1',
      name: 'target',
      type: StepParameterType.STRING,
      order: 1,
      templateStepId: 'step-1',
    } as never,
  ]

  it('builds template step selection state', () => {
    const selection = getTemplateStepSelectionUpdates('step-1', templateSteps, templateStepParams)

    expect(selection).not.toBeNull()
    expect(selection?.gherkinStep).toContain('click')
  })

  it('builds parameter preview updates', () => {
    const preview = getParameterPreviewUpdates(templateSteps[0], [
      { name: 'target', value: 'Submit', type: StepParameterType.STRING, order: 1 },
    ])

    expect(preview.parameters).toHaveLength(1)
    expect(preview.gherkinStep).toContain('Submit')
  })
})
