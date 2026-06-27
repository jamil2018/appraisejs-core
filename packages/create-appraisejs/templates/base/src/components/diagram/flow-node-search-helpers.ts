import type { Node } from '@xyflow/react'

import { isAddNodePromptNode } from './flow-add-node-prompt-helpers'

export type FlowNodeSearchResult = {
  id: string
  label: string
}

export function searchFlowNodesByLabel(nodes: Node[], query: string): FlowNodeSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (normalizedQuery.length < 3) {
    return []
  }

  return nodes
    .filter(node => !isAddNodePromptNode(node))
    .map(node => ({
      id: node.id,
      label: typeof node.data.label === 'string' ? node.data.label : '',
    }))
    .filter(result => result.label.toLocaleLowerCase().includes(normalizedQuery))
}
