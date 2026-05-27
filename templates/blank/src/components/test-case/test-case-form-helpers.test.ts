import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  buildScenarioPreview,
  buildScenarioSteps,
  getNodesWithMissingMandatoryParams,
} from './test-case-form-helpers'

describe('test-case form helpers', () => {
  it('builds gherkin preview text from ordered scenario steps', () => {
    expect(
      buildScenarioPreview('Login works', 'Smoke path', {
        'node-1': {
          order: 1,
          label: 'Open login page',
          gherkinStep: 'open login page',
          parameters: [],
          templateStepId: 'step-1',
        },
        'node-2': {
          order: 2,
          label: 'See dashboard',
          gherkinStep: 'should see dashboard',
          parameters: [],
          templateStepId: 'step-2',
        },
      }),
    ).toBe(`Scenario: [Login works] Smoke path\nGiven open login page\nThen should see dashboard`)
  })

  it('normalizes template default values into schema-ready step values', () => {
    expect(
      buildScenarioSteps({
        'node-1': {
          order: 1,
          label: 'Fill email',
          gherkinStep: 'fill email',
          icon: 'INPUT',
          parameters: [
            {
              name: 'email',
              defaultValue: 'qa@appraise.dev',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          templateStepId: 'step-1',
        },
      }),
    ).toEqual([
      {
        nodeId: 'node-1',
        gherkinStep: 'fill email',
        label: 'Fill email',
        icon: TemplateStepIcon.INPUT,
        parameters: [
          {
            name: 'email',
            value: 'qa@appraise.dev',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        order: 1,
        templateStepId: 'step-1',
      },
    ])
  })

  it('identifies non-isolated nodes that are missing mandatory parameters', () => {
    expect(
      getNodesWithMissingMandatoryParams(
        {
          'node-1': {
            order: 1,
            label: 'Click submit',
            parameters: [],
            templateStepId: 'step-1',
          },
          'node-2': {
            order: -1,
            label: 'Unused node',
            parameters: [],
            templateStepId: 'step-1',
          },
        },
        [
          {
            id: 'param-1',
            name: 'target',
            type: StepParameterType.STRING,
            order: 1,
            isMandatory: true,
            templateStepId: 'step-1',
          } as never,
        ],
      ),
    ).toEqual(['Click submit'])
  })
})
