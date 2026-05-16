import type {
  TemplateTestCase,
  TemplateTestCaseFlowBlock,
  TemplateTestCaseFlowBlockNode,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
} from '@prisma/client'

export type TemplateSelectionOption = {
  label: string
  value: string
}

export type TemplateSelectionRow = {
  id: string
  name: string
}

export type TemplateTestCaseWithSteps = TemplateTestCase & {
  steps: (TemplateTestCaseStep & {
    parameters: TemplateTestCaseStepParameter[]
  })[]
  flowBlocks?: (TemplateTestCaseFlowBlock & { nodes: TemplateTestCaseFlowBlockNode[] })[]
}
