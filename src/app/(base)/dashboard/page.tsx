import type { Metadata } from 'next'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import AppDrawer from '../../(dashboard-components)/app-drawer'
import {
  getDashboardMetrics,
  getEntityMetrics,
  getTestSuiteExecutionData,
} from '@/services/dashboard/dashboard-service'
import QuickActionsDrawer from '../../(dashboard-components)/quick-actions-drawer'
import DataCard from '../../(dashboard-components)/data-card'
import OngoingTestRunsCard from '../../(dashboard-components)/ongoing-test-runs-card'
import { DataCardGrid } from '../../(dashboard-components)/data-card-grid'
import { ExecutionHealthPanel } from '../../(dashboard-components)/execution-health-panel'
import { LayoutDashboard } from 'lucide-react'
import { requireActiveProject } from '@/lib/active-project'
import { listLatestAgentPreflightReceipts } from '@/services/agent-preflight/agent-preflight-service'
import { DashboardStartPanel } from '../../(dashboard-components)/dashboard-start-panel'

export const metadata: Metadata = {
  title: 'Appraise | Dashboard',
  description: 'Check metrics, entity states, execution health, and quick actions.',
}

export const dynamic = 'force-dynamic'

const Dashboard = async ({ searchParams }: { searchParams: Promise<{ project?: string }> }) => {
  const { project } = await searchParams
  const activeProject = await requireActiveProject(project)
  const [entityMetrics, metrics, testSuiteExecutionData, preflightReceipts] = await Promise.all([
    getEntityMetrics(activeProject.id),
    getDashboardMetrics(activeProject.id),
    getTestSuiteExecutionData(activeProject.id),
    listLatestAgentPreflightReceipts([activeProject.id]),
  ])
  const { testCasesCount, testSuitesCount, stepDefinitionsCount, runningTestRunsCount } = entityMetrics
  const agentReady = preflightReceipts[activeProject.id]?.ready ?? null

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PageHeader>
          <span className="flex items-center gap-3">
            <LayoutDashboard aria-hidden="true" className="size-7 text-primary" strokeWidth={2.2} />
            Dashboard
          </span>
        </PageHeader>
        <HeaderSubtitle>Review recent execution and manage quality work for this project.</HeaderSubtitle>
      </div>

      <DashboardStartPanel entityMetrics={entityMetrics} projectId={activeProject.id} agentReady={agentReady} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]" id="dashboard-content">
        <div className="grid min-w-0 gap-4">
          <div className="grid min-w-0 items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            <AppDrawer
              metrics={metrics}
              title="Attention Needed"
              hasExecutionEvidence={entityMetrics.completedTestRunsCount > 0}
            />
            <DataCardGrid>
              <DataCard title="Test Cases" value={testCasesCount} link="/test-cases" />
              <DataCard title="Test Suites" value={testSuitesCount} link="/test-suites" />
              <DataCard title="Step Definitions" value={stepDefinitionsCount} link="/step-definitions" />
              <OngoingTestRunsCard
                key={activeProject.id}
                initialCount={runningTestRunsCount}
                link="/test-runs"
                projectId={activeProject.id}
              />
            </DataCardGrid>
          </div>
          <QuickActionsDrawer />
        </div>
        <ExecutionHealthPanel featureData={testSuiteExecutionData} />
      </div>
    </div>
  )
}

export default Dashboard
