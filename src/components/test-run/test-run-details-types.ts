import type { Environment, Report, Tag, TestRun, TestRunTestCase } from '@prisma/client'
import type { LucideIcon } from 'lucide-react'

export type TestRunDetailsTestCase = TestRunTestCase & {
  testCase: { title: string; description: string }
  testSuite: { id: string; name: string } | null
}

export type TestRunDetailsData = TestRun & {
  testCases: TestRunDetailsTestCase[]
  tags: Tag[]
  environment: Environment
  reports: Report[]
}

export type StatusMeta = {
  label: string
  icon: LucideIcon
  badgeClassName?: string
  iconClassName?: string
}
