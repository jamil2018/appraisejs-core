import type {
  TestCase,
  TestCaseFlowBlock,
  TestCaseFlowBlockNode,
  TestCaseStep,
  TestCaseStepParameter,
} from '@prisma/client'

export type EditableTestCase = TestCase & {
  steps: (TestCaseStep & { parameters: TestCaseStepParameter[] })[]
  flowBlocks?: (TestCaseFlowBlock & { nodes: TestCaseFlowBlockNode[] })[]
  testSuiteIds: string[]
  tagIds: string[]
}
