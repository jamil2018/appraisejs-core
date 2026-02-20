import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import AppDrawer from './(dashboard-components)/app-drawer'
import {
  EntityMetrics,
  getDashboardMetricsAction,
  getEntityMetricsAction,
  getTestSuiteExecutionDataAction,
  TestSuiteExecutionData,
} from '@/actions/dashboard/dashboard-actions'
import { DashboardMetrics } from '@prisma/client'
import QuickActionsDrawer from './(dashboard-components)/quick-actions-drawer'
import DataCard from './(dashboard-components)/data-card'
import OngoingTestRunsCard from './(dashboard-components)/ongoing-test-runs-card'
import { DataCardGrid } from './(dashboard-components)/data-card-grid'
import { ExecutionHealthPanel } from './(dashboard-components)/execution-health-panel'

const Dashboard = async () => {
  const metricsResponse = await getDashboardMetricsAction()
  const metrics = metricsResponse.status === 200 ? (metricsResponse.data as DashboardMetrics | null) : null

  const entityMetricsResponse = await getEntityMetricsAction()
  const entityMetrics =
    entityMetricsResponse.status === 200 ? (entityMetricsResponse.data as unknown as EntityMetrics) : null
  if (!entityMetrics) {
    return <div>Error loading entity metrics</div>
  }

  const { testCasesCount, testSuitesCount, templateStepsCount, runningTestRunsCount } = entityMetrics

  // Fetch test suite execution data
  const testSuiteExecutionResponse = await getTestSuiteExecutionDataAction()
  const testSuiteExecutionData =
    testSuiteExecutionResponse.status === 200 ? (testSuiteExecutionResponse.data as TestSuiteExecutionData) : []

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Dashboard</PageHeader>
        <HeaderSubtitle>Check metrics, entity states, execution health, and more</HeaderSubtitle>
      </div>
      <div className="flex gap-7" id="dashboard-content">
        <div className="flex flex-col gap-7">
          <div className="flex gap-7">
            <AppDrawer metrics={metrics} title="Attention Needed" description="Issues that require immediate action" />
            <DataCardGrid>
              <DataCard title="Test Cases" value={testCasesCount} link="/test-cases" />
              <DataCard title="Test Suites" value={testSuitesCount} link="/test-suites" />
              <DataCard title="Template Steps" value={templateStepsCount} link="/template-steps" />
              <OngoingTestRunsCard initialCount={runningTestRunsCount} link="/test-runs" />
            </DataCardGrid>
          </div>
          <QuickActionsDrawer />
        </div>
        <div className="flex-1">
          <ExecutionHealthPanel featureData={testSuiteExecutionData} />
        </div>
      </div>
    </div>
  )
}

export default Dashboard
