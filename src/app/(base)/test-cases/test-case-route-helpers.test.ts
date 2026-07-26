import { StepParameterType, StepIcon } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildNodeOrderFromTestCaseSteps, getEditableTestCase } from './editable-test-case-helpers'
import { getTestCaseFormRouteResources, getTestCaseRouteLoadError } from './test-case-route-resource-helpers'
import { getTestCaseRows } from './test-case-row-helpers'

const invocationJson = JSON.stringify({
  step: { id: 'browser.forms.fill', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
  inputs: { email: 'qa@appraise.dev' },
  presentation: { keyword: 'When', description: 'fill email' },
})

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

  it('returns the first route load error and shapes shared form resources', () => {
    expect(getTestCaseRouteLoadError([{ status: 200 }, { status: 500, error: 'Locators unavailable' }])).toBe(
      'Locators unavailable',
    )

    expect(
      getTestCaseFormRouteResources({
        stepDefinitionsResponse: {
          status: 200,
          data: [
            {
              reference: { id: 'browser.navigation.goto', version: '1', definitionHash: `sha256:${'c'.repeat(64)}` },
              title: 'Navigate to URL',
              description: 'Navigates to a URL.',
              signature: 'the user navigates to the {string} url',
              keywordCompatibility: ['Given', 'When'],
              groupId: 'navigation',
              inputs: [],
            },
          ],
        },
        testSuitesResponse: { status: 200, data: [{ id: 'suite-1', name: 'Smoke' }] },
        locatorsResponse: { status: 200, data: [{ id: 'locator-1', name: 'Submit' }] },
        locatorGroupsResponse: { status: 200, data: [{ id: 'group-1', name: 'Checkout' }] },
        tagsResponse: { status: 200, data: [{ id: 'tag-1', name: 'smoke' }] },
        testCasesResponse: { status: 200, data: [{ id: 'case-1', title: 'Login', steps: [], tags: [] }] },
        moduleListResponse: { status: 200, data: [{ id: 'module-1', name: 'Auth' }] },
        environmentsResponse: { status: 200, data: [{ id: 'environment-1', name: 'Local' }] },
      }),
    ).toMatchObject({
      stepDefinitions: [expect.objectContaining({ title: 'Navigate to URL' })],
      testSuites: [{ id: 'suite-1', name: 'Smoke' }],
      locators: [{ id: 'locator-1', name: 'Submit' }],
      locatorGroups: [{ id: 'group-1', name: 'Checkout' }],
      tags: [{ id: 'tag-1', name: 'smoke' }],
      testCases: [{ id: 'case-1', title: 'Login', steps: [], tags: [] }],
      moduleList: [{ id: 'module-1', name: 'Auth' }],
      environments: [{ id: 'environment-1', name: 'Local' }],
    })
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
          icon: StepIcon.INPUT,
          invocationJson,
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
        icon: StepIcon.INPUT,
        parameters: [
          {
            name: 'email',
            value: 'qa@appraise.dev',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        invocation: JSON.parse(invocationJson),
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

  it('requires an exact canonical invocation for editable test case steps', () => {
    const currentStep = {
      id: 'current-step',
      order: 0,
      label: 'Open home',
      gherkinStep: 'open home',
      icon: StepIcon.NAVIGATION,
      invocationJson: JSON.stringify({
        step: { id: 'browser.navigation.goto', version: '1', definitionHash: `sha256:${'b'.repeat(64)}` },
        inputs: {},
        presentation: { keyword: 'Given', description: 'open home' },
      }),
      parameters: [],
    }
    expect(buildNodeOrderFromTestCaseSteps([currentStep] as never)).toMatchObject({
      'current-step': {
        invocation: expect.objectContaining({
          step: { id: 'browser.navigation.goto', version: '1', definitionHash: `sha256:${'b'.repeat(64)}` },
        }),
      },
    })
    expect(() => buildNodeOrderFromTestCaseSteps([{ ...currentStep, invocationJson: null }] as never)).toThrow()
  })
})
