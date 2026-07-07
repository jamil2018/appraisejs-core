import type { Environment, Report, Tag, TestRun, TestRunTestCase } from '@prisma/client'
import type { LucideIcon } from 'lucide-react'

export type TestRunEvidenceHealth =
  | 'valid'
  | 'invalid_empty_run'
  | 'invalid_missing_test_cases'
  | 'invalid_missing_report'
  | 'invalid_placeholder_binary'
  | 'invalid_unmatched_scenarios'
  | 'invalid_stale_runtime'
  | 'infrastructure_failure'

export type TestRunDetailsTestCase = TestRunTestCase & {
  testCase: { title: string; description: string }
  testSuite: { id: string; name: string } | null
}

export type TestRunDetailsData = TestRun & {
  evidenceHealth: TestRunEvidenceHealth
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
