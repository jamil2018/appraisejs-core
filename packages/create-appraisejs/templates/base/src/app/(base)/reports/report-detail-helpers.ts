import { BrowserEngine, StepStatus, TestRunResult } from '@prisma/client'
import { Compass, Flame } from 'lucide-react'
import { createElement } from 'react'

import type { ChartConfig } from '@/components/ui/chart'
export type { ReportDetailWithRelations } from '@/types/report'
import type { ReportDetailWithRelations, ReportWithRelations } from '@/types/report'

export const reportColorMap = {
  passed: 'rgb(var(--success-rgb))',
  failed: 'rgb(var(--danger-rgb))',
  cancelled: 'rgb(var(--muted-foreground-rgb))',
  unknown: 'rgb(var(--warning-rgb))',
  default: 'rgb(var(--info-rgb))',
} as const

export const browserIcons = {
  [BrowserEngine.CHROMIUM]: createElement(Flame, { className: 'size-4' }),
  [BrowserEngine.FIREFOX]: createElement(Flame, { className: 'size-4' }),
  [BrowserEngine.WEBKIT]: createElement(Compass, { className: 'size-4' }),
} as const

export const overViewPieChartConfig = {
  value: {
    label: 'Value',
  },
  passed: {
    label: 'Passed',
    color: reportColorMap.passed,
  },
  failed: {
    label: 'Failed',
    color: reportColorMap.failed,
  },
  cancelled: {
    label: 'Untested',
    color: reportColorMap.cancelled,
  },
  unknown: {
    label: 'Unknown',
    color: reportColorMap.unknown,
  },
} satisfies ChartConfig

export const resultByFeatureBarChartConfig = {
  feature: {
    label: 'Feature',
  },
  passed: {
    label: 'Passed',
    color: reportColorMap.passed,
  },
  failed: {
    label: 'Failed',
    color: reportColorMap.failed,
  },
  cancelled: {
    label: 'Cancelled',
    color: reportColorMap.cancelled,
  },
  unknown: {
    label: 'Unknown',
    color: reportColorMap.unknown,
  },
} satisfies ChartConfig

export const durationByFeatureBarChartConfig = {
  feature: {
    label: 'Feature',
  },
  duration: {
    label: 'Duration',
  },
} satisfies ChartConfig

export function isValidReportDetail(data: unknown): data is ReportDetailWithRelations {
  if (!data || typeof data !== 'object') {
    return false
  }

  const report = data as Record<string, unknown>
  return (
    'id' in report &&
    'testRun' in report &&
    'testCases' in report &&
    'features' in report &&
    Array.isArray(report.testCases) &&
    Array.isArray(report.features) &&
    report.testRun !== null &&
    typeof report.testRun === 'object'
  )
}

export function isValidReportList(data: unknown): data is ReportWithRelations[] {
  if (!Array.isArray(data)) {
    return false
  }

  return data.every(
    item =>
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'testRun' in item &&
      'testCases' in item &&
      Array.isArray(item.testCases),
  )
}

export function formatDateTime(date: Date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(startDate: Date, endDate: Date | null) {
  if (!endDate) {
    return '-'
  }

  const diffInMs = endDate.getTime() - startDate.getTime()
  const totalSeconds = Math.floor(diffInMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

export function getReportMetrics(report: ReportDetailWithRelations) {
  const totalTests = report.testCases.length
  const passedTests = report.testCases.filter(rtc => rtc.testRunTestCase.result === 'PASSED').length
  const failedTests = report.testCases.filter(rtc => rtc.testRunTestCase.result === 'FAILED').length
  const untestedTests = report.testCases.filter(rtc => rtc.testRunTestCase.result === 'UNTESTED').length

  return {
    totalTests,
    passedTests,
    failedTests,
    untestedTests,
  }
}

export function getReportOutcome(report: ReportDetailWithRelations) {
  const metrics = getReportMetrics(report)
  const { passedTests, failedTests, untestedTests, totalTests } = metrics
  const skippedSteps = report.features.reduce(
    (count, feature) =>
      count +
      feature.scenarios.reduce(
        (scenarioCount, scenario) =>
          scenarioCount + scenario.steps.filter(step => step.status === StepStatus.SKIPPED).length,
        0,
      ),
    0,
  )
  const counts = `${passedTests} passed · ${failedTests} failed · ${untestedTests} untested${skippedSteps ? ` · ${skippedSteps} skipped ${skippedSteps === 1 ? 'step' : 'steps'}` : ''}`

  switch (report.testRun.result) {
    case TestRunResult.FAILED:
      return { title: 'Run failed', description: counts, tone: 'danger' as const }
    case TestRunResult.BLOCKED:
      return { title: 'Run blocked pending human verification', description: counts, tone: 'warning' as const }
    case TestRunResult.PASSED:
      return { title: 'Run passed', description: counts, tone: 'success' as const }
    case TestRunResult.CANCELLED:
      return { title: 'Run cancelled', description: counts, tone: 'neutral' as const }
    default:
      return {
        title: 'Run result pending',
        description: totalTests > 0 ? counts : 'No test case results are available yet.',
        tone: 'neutral' as const,
      }
  }
}

export function getOverviewData(report: ReportDetailWithRelations) {
  const { passedTests, failedTests } = getReportMetrics(report)

  return [
    {
      result: 'passed',
      value: passedTests,
      fill: reportColorMap.passed,
    },
    {
      result: 'failed',
      value: failedTests,
      fill: reportColorMap.failed,
    },
    {
      result: 'cancelled',
      value: report.testCases.filter(rtc => rtc.testRunTestCase.result === 'UNTESTED').length,
      fill: reportColorMap.cancelled,
    },
    {
      result: 'unknown',
      value: 0,
      fill: reportColorMap.unknown,
    },
  ]
}

export function getFeatureData(report: ReportDetailWithRelations) {
  return report.features.map(feature => {
    const scenarios = feature.scenarios
    const passed = scenarios.filter(
      scenario =>
        scenario.steps.every(step => step.status === StepStatus.PASSED) &&
        scenario.hooks.every(hook => hook.status === StepStatus.PASSED),
    ).length
    const failed = scenarios.filter(
      scenario =>
        scenario.steps.some(step => step.status === StepStatus.FAILED) ||
        scenario.hooks.some(hook => hook.status === StepStatus.FAILED),
    ).length
    const cancelled = scenarios.filter(
      scenario =>
        scenario.steps.some(step => step.status === StepStatus.SKIPPED) ||
        scenario.hooks.some(hook => hook.status === StepStatus.SKIPPED),
    ).length
    const unknown = scenarios.length - passed - failed - cancelled

    return {
      feature: feature.name,
      passed,
      failed,
      cancelled,
      unknown,
      total: scenarios.length,
    }
  })
}

export function getDurationData(report: ReportDetailWithRelations) {
  return report.features.map(feature => {
    const totalDuration = feature.scenarios.reduce((total, scenario) => {
      const scenarioDuration =
        scenario.steps.reduce((stepTotal, step) => stepTotal + Number(step.duration), 0) +
        scenario.hooks.reduce((hookTotal, hook) => hookTotal + Number(hook.duration), 0)
      return total + scenarioDuration
    }, 0)

    return {
      feature: feature.name,
      duration: Number((totalDuration / 1000000000).toFixed(2)),
    }
  })
}
