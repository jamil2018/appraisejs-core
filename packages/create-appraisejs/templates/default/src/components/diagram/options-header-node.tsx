import { memo } from 'react'

import { NodeProps, Handle, Position } from '@xyflow/react'

import { BaseNode } from '@/components/base-node'
import {
  NodeHeader,
  NodeHeaderTitle,
  NodeHeaderActions,
  NodeHeaderIcon,
  NodeHeaderDeleteAction,
} from '@/components/node-header'
import { NodeHeaderEditAction } from './edit-header-option'
import { TemplateStepIcon } from '@prisma/client'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { cn } from '@/lib/utils'

interface OptionsHeaderNodeData {
  label: string
  gherkinStep: string
  isFirstNode?: boolean
  icon?: TemplateStepIcon
  isMissingParams?: boolean
}

interface OptionsHeaderNodeProps extends NodeProps {
  onEdit: (nodeId: string) => void
}

const OptionsHeaderNode = memo(({ selected, data, onEdit }: OptionsHeaderNodeProps) => {
  OptionsHeaderNode.displayName = 'OptionsHeaderNode'

  const { label, gherkinStep, isFirstNode, icon, isMissingParams } = data as unknown as OptionsHeaderNodeData

  return (
    <BaseNode selected={selected} className={cn('max-w-80 border-none px-3 py-2', isMissingParams && 'bg-red-700')}>
      {!isFirstNode && <Handle type="target" position={Position.Left} />}
      <NodeHeader className="-mx-3 -mt-2 border-b">
        <NodeHeaderIcon>{KeyToIconTransformer(icon as TemplateStepIcon)}</NodeHeaderIcon>
        <NodeHeaderTitle>{label}</NodeHeaderTitle>
        <NodeHeaderActions>
          <NodeHeaderEditAction
            label="Edit"
            onClick={nodeId => {
              onEdit(nodeId)
            }}
          />
          <NodeHeaderDeleteAction />
        </NodeHeaderActions>
      </NodeHeader>
      <div className="mt-2">{gherkinStep}</div>
      <Handle type="source" position={Position.Right} />
    </BaseNode>
  )
})

export default OptionsHeaderNode
