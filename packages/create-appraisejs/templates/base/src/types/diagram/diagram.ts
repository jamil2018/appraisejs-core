import { StepParameterType } from '@prisma/client'
import type { StepInvocation } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

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
  invocation: StepInvocation
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
  invocation: StepInvocation
}

export type TemplateTestCaseNodeOrderMap = Record<string, TemplateTestCaseNodeData>

export type FlowBlock = {
  id: string
  name: string
  nodeIds: string[]
}
