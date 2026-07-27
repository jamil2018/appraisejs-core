import { describe, expect, it } from 'vitest'

import { createTestCaseFormState, testCaseFormReducer } from './test-case-form-reducer'
import { createAuthoredFlowNode } from '@/components/diagram/authored-flow-model'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.navigation.goto', version: '1', definitionHash: 'sha256:ready' },
  title: 'Navigate to URL',
  description: 'Navigates.',
  signature: 'I navigate to {url}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'url', type: 'string', required: true, defaultValue: '/' }],
}

describe('testCaseFormReducer', () => {
  it('preserves authored node order and blocks when switching authoring views', () => {
    const first = createAuthoredFlowNode(definition, 'first')
    const second = { ...createAuthoredFlowNode(definition, 'second'), order: 2 }
    const nodesOrder = { first, second }
    const flowBlocks = [{ id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] }]
    const state = createTestCaseFormState({
      defaultNodesOrder: nodesOrder,
      defaultFlowBlocks: flowBlocks,
      testSuites: [],
      tags: [],
      initialWizardStep: 1,
    })

    const next = testCaseFormReducer(state, { type: 'setAuthoringView', view: 'linear' })
    expect(next.authoringView).toBe('linear')
    expect(next.nodesOrder).toBe(nodesOrder)
    expect(Object.keys(next.nodesOrder)).toEqual(['first', 'second'])
    expect(next.flowBlocks).toBe(flowBlocks)
  })
})
