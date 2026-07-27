import { describe, expect, it } from 'vitest'

import { createAuthoredFlowNode } from './authored-flow-model'
import { groupedNodeIds, normalizeAuthoredFlowBlocks, updatedFlowBlockMembership } from './authored-flow-blocks'
import type { StepDefinitionOption } from '@/types/step-definition-option'

const definition: StepDefinitionOption = {
  reference: { id: 'browser.navigation.goto', version: '1', definitionHash: 'sha256:ready' },
  title: 'Navigate to URL',
  description: 'Navigates.',
  signature: 'I navigate to {url}',
  keywordCompatibility: ['When'],
  groupId: 'browser',
  inputs: [{ name: 'url', type: 'string', required: true }],
}

const flow = ['first', 'second', 'third', 'fourth'].map((nodeId, index) => ({
  nodeId,
  node: { ...createAuthoredFlowNode(definition, nodeId), order: index + 1 },
}))

describe('authored flow blocks', () => {
  it('accepts only a contiguous ungrouped selection in execution order', () => {
    expect(groupedNodeIds(flow, ['third', 'second'], [])).toEqual(['second', 'third'])
    expect(groupedNodeIds(flow, ['first', 'third'], [])).toBeNull()
    expect(
      groupedNodeIds(flow, ['second', 'third'], [{ id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] }]),
    ).toBeNull()
  })

  it('removes orphaned or noncontiguous block memberships after flow mutation', () => {
    expect(
      normalizeAuthoredFlowBlocks(
        flow.filter(item => item.nodeId !== 'second'),
        [
          { id: 'setup', name: ' Setup ', nodeIds: ['first', 'second'] },
          { id: 'broken', name: 'Broken', nodeIds: ['first', 'fourth'] },
        ],
      ),
    ).toEqual([])
  })

  it('edits membership only to a contiguous selection that does not cross another block', () => {
    const flowBlocks = [
      { id: 'setup', name: 'Setup', nodeIds: ['first', 'second'] },
      { id: 'action', name: 'Action', nodeIds: ['third', 'fourth'] },
    ]
    expect(updatedFlowBlockMembership(flow, flowBlocks, 'setup', ['first', 'second', 'third'])).toBeNull()
    expect(updatedFlowBlockMembership(flow, flowBlocks, 'setup', ['first', 'second'])).toEqual(flowBlocks)
  })
})
