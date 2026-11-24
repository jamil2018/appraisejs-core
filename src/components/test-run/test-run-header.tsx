'use client'

import PageHeader from '@/components/typography/page-header'
import { ViewReportButton } from '@/components/test-run/view-report-button'
import { TestRunResultBadge } from '@/components/test-run/test-run-report-badges'
import { Button } from '@/components/ui/button'
import { journeyRecordBriefHref } from '@/lib/quality-journey/record-context'
import { TestRunResult, TestRunStatus, TestRunTestCaseResult } from '@prisma/client'
import Link from 'next/link'
import type { TestRunDetailsData } from './test-run-details-helpers'
import { useTestRunHeader } from './use-test-run-header'

type TestRunHeaderProps = {
  initialTestRun: TestRunDetailsData
}

export function TestRunHeader({ initialTestRun }: TestRunHeaderProps) {
  const { testRun } = useTestRunHeader({ initialTestRun })
  const failedCases = testRun.testCases.filter(testCase => testCase.result === TestRunTestCaseResult.FAILED)
  const passedCount = testRun.testCases.filter(testCase => testCase.result === TestRunTestCaseResult.PASSED).length
  const untestedCount = testRun.testCases.filter(testCase => testCase.result === TestRunTestCaseResult.UNTESTED).length
  const outcomeTitle = {
    [TestRunResult.PASSED]: 'Run passed',
    [TestRunResult.FAILED]: 'Run failed',
    [TestRunResult.BLOCKED]: 'Run blocked pending human verification',
    [TestRunResult.CANCELLED]: 'Run cancelled',
    [TestRunResult.PENDING]: 'Run result pending',
  }[testRun.result]
  const untestedLabel =
    testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED ? 'untested' : 'pending'

  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageHeader>Test Run Details</PageHeader>
          <p className="text-sm text-muted-foreground">{testRun.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            nativeButton={false}
            variant="secondary"
            size="sm"
            render={
              <Link href={journeyRecordBriefHref(testRun.targetProjectId, { kind: 'test-run', id: testRun.id })} />
            }
          >
            Use in a Journey
          </Button>
          <ViewReportButton testRunStatus={testRun.status} reports={testRun.reports} />
        </div>
      </div>
      <section aria-labelledby="test-run-outcome-heading" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TestRunResultBadge result={testRun.result} />
          <h2 id="test-run-outcome-heading" className="text-lg font-semibold">
            {outcomeTitle}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {passedCount} passed · {failedCases.length} failed · {untestedCount} {untestedLabel}
        </p>
        {failedCases.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Failed checks</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {failedCases.map(testCase => (
                <li
                  key={testCase.id}
                  className="rounded-lg border border-danger-border bg-danger-surface/50 px-3 py-2 text-sm"
                >
                  {testCase.testCase.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}
