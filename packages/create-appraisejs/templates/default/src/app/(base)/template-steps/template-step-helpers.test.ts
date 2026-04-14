import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
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

  it('keeps template step list rows when parameters only include id and name', () => {
    expect(
      getTemplateStepRows([
        {
          id: 'step-1',
          name: 'Click',
          description: null,
          type: TemplateStepType.ACTION,
          signature: 'click',
          icon: TemplateStepIcon.MOUSE,
          templateStepGroupId: 'group-1',
          templateStepGroup: {
            id: 'group-1',
            name: 'Actions',
            description: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          parameters: [
            {
              id: 'param-1',
              name: 'target',
            },
          ],
        },
      ]),
    ).toHaveLength(1)
  })

  it('narrows editable template step details with full parameter rows', () => {
    expect(
      getTemplateStepRows([
        {
          id: 'step-1',
          name: 'Click',
          description: null,
          type: TemplateStepType.ACTION,
          signature: 'click',
          icon: TemplateStepIcon.MOUSE,
          templateStepGroupId: 'group-1',
          templateStepGroup: {
            id: 'group-1',
            name: 'Actions',
            description: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
