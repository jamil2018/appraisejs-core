import { Tag, TestCase, TestCaseStep } from '@prisma/client'

export type TestCasePickerRow = TestCase & {
  steps: TestCaseStep[]
  tags: Tag[]
}
