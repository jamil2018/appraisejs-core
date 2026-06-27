'use client'

import type { NodeProps } from '@xyflow/react'

import ButtonEdge from './button-edge'
import OptionsHeaderNode from './options-header-node'
import { AddNodePromptNode, type AddNodePromptFlowNode } from './add-node-prompt-node'

export const flowDiagramHandlersRef = {
  current: {
    onEditNode: (nodeId: string) => {
      void nodeId
    },
    onOpenAddNode: (sourceNodeId?: string) => {
      void sourceNodeId
    },
  },
}

function OptionsHeaderNodeWrapper(props: NodeProps) {
  return (
    <OptionsHeaderNode
      {...props}
      onEdit={nodeId => flowDiagramHandlersRef.current.onEditNode(nodeId)}
      onAddConnectedNode={nodeId => flowDiagramHandlersRef.current.onOpenAddNode(nodeId)}
    />
  )
}

function AddNodePromptNodeWrapper(props: NodeProps) {
  return (
    <AddNodePromptNode
      {...(props as NodeProps<AddNodePromptFlowNode>)}
      onOpenAddNode={() => flowDiagramHandlersRef.current.onOpenAddNode()}
    />
  )
}

export const flowEdgeTypes = {
  buttonEdge: ButtonEdge,
}

export const flowNodeTypes = {
  optionsHeaderNode: OptionsHeaderNodeWrapper,
  addNodePromptNode: AddNodePromptNodeWrapper,
}
