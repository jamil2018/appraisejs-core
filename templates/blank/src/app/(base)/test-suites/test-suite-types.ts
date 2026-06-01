import type { Module, Tag, TestCase, TestSuite as PrismaTestSuite } from '@prisma/client'

import type { TestSuite } from '@/constants/form-opts/test-suite-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

export type TestSuiteTableRow = PrismaTestSuite & {
  tags?: Tag[]
  module: Module
  testCases: TestCase[]
}

export type EditableTestSuite = PrismaTestSuite & {
  testCases: TestCase[]
  module: Module
  tags: Tag[]
}

export type TestSuiteGroupOption = {
  id: string
  name: string
}

export type TestSuiteFormSubmitAction = (_prev: unknown, value: TestSuite, id?: string) => Promise<ActionResponse>

export type TestSuiteInfoCard = {
  showHighlightGroup: boolean
  highlight: string
  legend: string
  defaultText: string
}
