import { Module, Tag, TestCase, TestCaseStep, TestSuite } from '@prisma/client'

export type TestSuitePickerTestCaseRow = TestCase & {
  steps: TestCaseStep[]
  tags: Tag[]
}

export type TestSuitePickerRow = TestSuite & {
  module: Module
  tags: Tag[]
  testCases: TestSuitePickerTestCaseRow[]
}

export type TestSuiteSelection = {
  testSuiteId: string
  runAll: boolean
  testCaseIds: string[]
}
