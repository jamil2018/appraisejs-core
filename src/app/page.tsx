import type { Metadata } from 'next'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import AppDrawer from './(dashboard-components)/app-drawer'
import {
  getDashboardMetricsAction,
  getEntityMetricsAction,
  getTestSuiteExecutionDataAction,
} from '@/actions/dashboard/dashboard-actions'
import type { EntityMetrics, TestSuiteExecutionData } from '@/services/dashboard/dashboard-service'
import { DashboardMetrics } from '@prisma/client'
import QuickActionsDrawer from './(dashboard-components)/quick-actions-drawer'
import DataCard from './(dashboard-components)/data-card'
import OngoingTestRunsCard from './(dashboard-components)/ongoing-test-runs-card'
import { DataCardGrid } from './(dashboard-components)/data-card-grid'
import { ExecutionHealthPanel } from './(dashboard-components)/execution-health-panel'
import { LayoutDashboard } from 'lucide-react'
import { requireActiveProject } from '@/lib/active-project'
import { listLatestAgentPreflightReceipts } from '@/services/agent-preflight/agent-preflight-service'
import { DashboardStartPanel } from './(dashboard-components)/dashboard-start-panel'

export const metadata: Metadata = {
  title: 'Appraise | Dashboard',
  description: 'Check metrics, entity states, execution health, and quick actions.',
}

export const dynamic = 'force-dynamic'

const Dashboard = async () => {
  const entityMetricsResponse = await getEntityMetricsAction()
  const entityMetrics =
    entityMetricsResponse.status === 200 ? (entityMetricsResponse.data as unknown as EntityMetrics) : null
  if (!entityMetrics) {
    return <div>Error loading entity metrics</div>
  }

  const metricsResponse = await getDashboardMetricsAction()
  const metrics = metricsResponse.status === 200 ? (metricsResponse.data as DashboardMetrics | null) : null

  const { testCasesCount, testSuitesCount, stepDefinitionsCount, runningTestRunsCount } = entityMetrics

  const activeProject = await requireActiveProject()
  const preflightReceipts = await listLatestAgentPreflightReceipts([activeProject.id])
  const agentReady = preflightReceipts[activeProject.id]?.ready ?? null

  // Fetch test suite execution data
  const testSuiteExecutionResponse = await getTestSuiteExecutionDataAction()
  const testSuiteExecutionData =
    testSuiteExecutionResponse.status === 200 ? (testSuiteExecutionResponse.data as TestSuiteExecutionData) : []

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <PageHeader>
          <span className="flex items-center gap-3">
            <LayoutDashboard className="size-7 text-primary sm:size-8" strokeWidth={2.2} />
            Dashboard
          </span>
        </PageHeader>
        <HeaderSubtitle>Check metrics, entity states, execution health, and more</HeaderSubtitle>
      </div>

      <DashboardStartPanel entityMetrics={entityMetrics} projectId={activeProject.id} agentReady={agentReady} />

      <div
        className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] 2xl:items-stretch"
        id="dashboard-content"
      >
        <div className="grid min-w-0 gap-4">
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
            <AppDrawer
              metrics={metrics}
              title="Attention Needed"
              description="Issues that require immediate action"
              hasExecutionEvidence={entityMetrics.completedTestRunsCount > 0}
            />
            <DataCardGrid>
              <DataCard title="Test Cases" value={testCasesCount} link="/test-cases" />
              <DataCard title="Test Suites" value={testSuitesCount} link="/test-suites" />
              <DataCard title="Step Definitions" value={stepDefinitionsCount} link="/step-definitions" />
              <OngoingTestRunsCard initialCount={runningTestRunsCount} link="/test-runs" />
            </DataCardGrid>
          </div>
          <QuickActionsDrawer />
        </div>
        <div className="min-w-0 2xl:flex">
          <ExecutionHealthPanel featureData={testSuiteExecutionData} />
        </div>
      </div>
    </div>
  )
}

export default Dashboard
