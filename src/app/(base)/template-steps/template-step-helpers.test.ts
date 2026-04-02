import { StepParameterType, TemplateStepType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildFunctionDefinitionPreview, getTemplateStepFormDefaults, getTemplateStepRows } from './template-step-helpers'

describe('template-step helpers', () => {
  it('builds function previews from signature, type, and params', () => {
    expect(
      buildFunctionDefinitionPreview(
        `When('', async function(this:CustomWorld){});`,
        'click {string}',
        TemplateStepType.ACTION,
        [{ name: 'target', type: StepParameterType.STRING }],
      ),
    ).toBe(`When('click {string}', async function(this:CustomWorld, target: string){});`)

    expect(
      buildFunctionDefinitionPreview(
        `When('click', async function(this:CustomWorld){});`,
        'see result',
        TemplateStepType.ASSERTION,
        [],
      ),
    ).toBe(`Then('see result', async function(this:CustomWorld){});`)
  })

  it('derives local state defaults for create and edit modes', () => {
    expect(getTemplateStepFormDefaults()).toEqual({
      signature: '',
      functionDefinition: `When('', async function(this:CustomWorld){});`,
      type: TemplateStepType.ACTION,
      params: [],
    })
  })

  it('narrows template step table rows with parameters', () => {
    expect(
      getTemplateStepRows([
        {
          id: 'step-1',
          name: 'Click',
          type: TemplateStepType.ACTION,
          signature: 'click',
          icon: 'MOUSE',
          templateStepGroupId: 'group-1',
          parameters: [
            {
              id: 'param-1',
              name: 'target',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
        },
      ]),
    ).toHaveLength(1)
  })
})
