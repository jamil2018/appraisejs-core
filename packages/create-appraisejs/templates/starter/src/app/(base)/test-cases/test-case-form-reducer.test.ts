import { describe, expect, it } from 'vitest'

import { createTestCaseFormState, testCaseFormReducer } from './test-case-form-reducer'

describe('testCaseFormReducer', () => {
  const baseState = createTestCaseFormState({
    defaultNodesOrder: {},
    defaultFlowBlocks: [],
    testSuites: [],
    tags: [],
    initialWizardStep: 0,
  })

  it('clears title error when title changes', () => {
    const withError = { ...baseState, errors: { title: ['Required'] } }
    const next = testCaseFormReducer(withError, { type: 'setTitle', title: 'Login flow' })

    expect(next.title).toBe('Login flow')
    expect(next.errors.title).toBeUndefined()
  })

  it('applies template conversion in one action', () => {
    const next = testCaseFormReducer(baseState, {
      type: 'applyTemplateConversion',
      payload: {
        title: 'From template',
        description: 'Template description',
        nodesOrder: {
          n1: {
            nodeId: 'n1',
            order: 1,
            label: 'Open page',
            parameters: [],
            templateStepId: 'step-1',
          },
        },
        flowBlocks: [{ id: 'b1', name: 'Block', nodeIds: ['n1'] }],
        appliedTemplateId: 'template-1',
      },
    })

    expect(next.title).toBe('From template')
    expect(next.appliedTemplateId).toBe('template-1')
    expect(next.nodesOrder.n1).toMatchObject({ nodeId: 'n1', order: 1 })
    expect(next.flowBlocks).toHaveLength(1)
  })

  it('adds an inline test suite and selects it', () => {
    const suite = {
      id: 'suite-1',
      name: 'Smoke',
      description: null,
      moduleId: 'module-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const next = testCaseFormReducer(
      { ...baseState, isCreateSuiteDialogOpen: true },
      { type: 'addTestSuite', testSuite: suite },
    )

    expect(next.availableTestSuites).toEqual([suite])
    expect(next.selectedTestSuites).toEqual(['suite-1'])
    expect(next.isCreateSuiteDialogOpen).toBe(false)
  })
})
