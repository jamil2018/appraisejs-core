import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import AppDrawer from './(dashboard-components)/app-drawer'
import { getDashboardMetricsAction } from '@/actions/dashboard/dashboard-actions'
import { DashboardMetrics } from '@prisma/client'
import QuickActionsDrawer from './(dashboard-components)/quick-actions-drawer'

const Dashboard = async () => {
  const metricsResponse = await getDashboardMetricsAction()
  const metrics = metricsResponse.status === 200 ? (metricsResponse.data as DashboardMetrics | null) : null

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Dashboard</PageHeader>
        <HeaderSubtitle>Welcome to the dashboard. Here you can see your test suites and run them.</HeaderSubtitle>
      </div>
      <div className="flex gap-4">
        <AppDrawer metrics={metrics} title="Attention Needed" description="Issues that require immediate action" />
        <QuickActionsDrawer />
      </div>
    </div>
  )
}

export default Dashboard
