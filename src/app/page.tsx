import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import AppDrawer from './(dashboard-components)/app-drawer'
import { EntityMetrics, getDashboardMetricsAction, getEntityMetricsAction } from '@/actions/dashboard/dashboard-actions'
import { DashboardMetrics } from '@prisma/client'
import QuickActionsDrawer from './(dashboard-components)/quick-actions-drawer'
import DataCard from './(dashboard-components)/data-card'
import { DataCardGrid } from './(dashboard-components)/data-card-grid'

const Dashboard = async () => {
  const metricsResponse = await getDashboardMetricsAction()
  const metrics = metricsResponse.status === 200 ? (metricsResponse.data as DashboardMetrics | null) : null

  const entityMetricsResponse = await getEntityMetricsAction()
  const entityMetrics = entityMetricsResponse.status === 200 ? (entityMetricsResponse.data as unknown as EntityMetrics) : null
  if (!entityMetrics) {
    return <div>Error loading entity metrics</div>
  }

  const { testCasesCount, testSuitesCount, templateStepsCount, runningTestRunsCount } = entityMetrics

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Dashboard</PageHeader>
        <HeaderSubtitle>Welcome to the dashboard. Here you can see your test suites and run them.</HeaderSubtitle>
      </div>
      <div className="flex gap-7 mb-4">
        <AppDrawer metrics={metrics} title="Attention Needed" description="Issues that require immediate action" />
        <DataCardGrid>
          <DataCard title="Test Cases" value={testCasesCount} link="/test-cases" />
          <DataCard title="Test Suites" value={testSuitesCount} link="/test-suites" />
          <DataCard title="Template Steps" value={templateStepsCount} link="/template-steps" />
          <DataCard title="Ongoing Test Runs" value={runningTestRunsCount} link="/test-runs" />
        </DataCardGrid>
      </div>
      <QuickActionsDrawer />
    </div>
  )
}

export default Dashboard
