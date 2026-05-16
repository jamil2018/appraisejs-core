import type { StepParameterType } from '@prisma/client'

export type NodeFormData = {
  label: string
  gherkinStep: string
  templateStepId: string
  parameters: {
    name: string
    value: string
    type: StepParameterType
    order: number
  }[]
}
