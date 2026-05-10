import { StepParameterType } from '@prisma/client'

export type NodeData = {
  nodeId?: string
  order: number
  label: string
  gherkinStep?: string
  isFirstNode?: boolean
  icon?: string
  parameters: {
    name: string
    value: string
    type: StepParameterType
    order: number
  }[]
  templateStepId: string
}

export type NodeOrderMap = Record<string, NodeData>

export type TemplateTestCaseNodeData = {
  nodeId?: string
  order: number
  label: string
  gherkinStep?: string
  icon?: string
  parameters: {
    name: string
    defaultValue: string
    type: StepParameterType
    order: number
  }[]
  templateStepId: string
}

export type TemplateTestCaseNodeOrderMap = Record<string, TemplateTestCaseNodeData>

export type FlowBlock = {
  id: string
  name: string
  nodeIds: string[]
}
