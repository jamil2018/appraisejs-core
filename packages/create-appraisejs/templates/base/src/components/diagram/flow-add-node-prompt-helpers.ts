import type { Node } from '@xyflow/react'

/** Client-only canvas node: not persisted in node order maps. */
const ADD_NODE_PROMPT_NODE_ID = '__appraise_add_node_prompt__'

export const ADD_NODE_PROMPT_NODE_TYPE = 'addNodePromptNode' as const

export type AddNodePromptNodeData = Record<string, never>

export function isAddNodePromptNode(node: Node): boolean {
  return node.type === ADD_NODE_PROMPT_NODE_TYPE || node.id === ADD_NODE_PROMPT_NODE_ID
}

export function createAddNodePromptNode(): Node {
  return {
    id: ADD_NODE_PROMPT_NODE_ID,
    type: ADD_NODE_PROMPT_NODE_TYPE,
    position: { x: 0, y: 0 },
    data: {},
    draggable: false,
  }
}
