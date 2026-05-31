import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildNodeOrderFromTestCaseSteps, getEditableTestCase } from './editable-test-case-helpers'
import { getTestCaseRows } from './test-case-row-helpers'

describe('test-case route helpers', () => {
  it('narrows test case list rows from action data', () => {
    expect(
      getTestCaseRows([
        {
          id: 'case-1',
          title: 'Login flow',
          steps: [],
          tags: [{ id: 'tag-1', name: 'smoke' }],
        },
        {
          id: 'broken-case',
          title: 'Broken row',
          steps: [],
          tags: ['bad-tag'],
        },
      ]),
    ).toEqual([
      {
        id: 'case-1',
        title: 'Login flow',
        steps: [],
        tags: [{ id: 'tag-1', name: 'smoke' }],
      },
    ])
  })

  it('narrows editable test cases and converts steps into node order', () => {
    const editableTestCase = getEditableTestCase({
      id: 'case-1',
      title: 'Login flow',
      description: 'Checks login',
      testSuiteIds: ['suite-1'],
      tagIds: ['tag-1'],
      steps: [
        {
          id: 'step-1',
          order: 1,
          label: 'Fill email',
          gherkinStep: 'fill email',
          icon: TemplateStepIcon.INPUT,
          templateStepId: 'template-step-1',
          parameters: [
            {
              name: 'email',
              value: 'qa@appraise.dev',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
        },
      ],
    })

    expect(editableTestCase).not.toBeNull()
    expect(buildNodeOrderFromTestCaseSteps(editableTestCase!.steps)).toEqual({
      'step-1': {
        nodeId: 'step-1',
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
    })
  })

  it('rejects malformed editable test case data', () => {
    expect(
      getEditableTestCase({
        id: 'case-1',
        title: 'Broken flow',
        steps: [{ id: 'step-1', label: 'Missing params array' }],
        testSuiteIds: ['suite-1'],
        tagIds: ['tag-1'],
      }),
    ).toBeNull()
  })
})
