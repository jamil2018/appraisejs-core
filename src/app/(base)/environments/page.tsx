import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import EmptyState from '@/components/data-state/empty-state'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Braces, KeyRound, Server, Waypoints } from 'lucide-react'
import { Metadata } from 'next'

import { getEnvironmentTableRows } from './environment-helpers'
import EnvironmentRegistry from './environment-registry'

export const metadata: Metadata = {
  title: 'Appraise | Environments',
  description: 'Manage test environments and their configurations',
}

const Environments = async () => {
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()
  const environmentsData = getEnvironmentTableRows(environments)
  const apiEndpointCount = environmentsData.filter(environment => environment.apiBaseUrl).length
  const accessProfileCount = environmentsData.filter(environment => environment.username).length

  return (
    <div className="space-y-6 pb-10">
      <div>
        <PageHeader>
          <span className="flex items-center gap-3">
            <Waypoints className="size-7 text-primary sm:size-8" strokeWidth={2.2} aria-hidden="true" />
            Environments
          </span>
        </PageHeader>
        <HeaderSubtitle>Define the runtime endpoints and access profiles used during test execution.</HeaderSubtitle>
      </div>

      <dl
        aria-label="Environment overview"
        className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-[rgba(18,37,64,0.1)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:grid-cols-4"
      >
        <div className="col-span-2 rounded-lg border border-white/[0.05] bg-white/[0.006] p-4 sm:col-span-1">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Server className="size-3.5" aria-hidden="true" />
            Registered
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{environmentsData.length}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.006] p-4">
          <dt className="text-xs font-medium text-muted-foreground">Base endpoints</dt>
          <dd className="text-foreground/90 mt-1 text-lg font-semibold tabular-nums">{environmentsData.length}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.006] p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Braces className="size-3.5" aria-hidden="true" />
            API endpoints
          </dt>
          <dd className="text-foreground/90 mt-1 text-lg font-semibold tabular-nums">{apiEndpointCount}</dd>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.006] p-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3.5" aria-hidden="true" />
            Access profiles
          </dt>
          <dd className="text-foreground/90 mt-1 text-lg font-semibold tabular-nums">{accessProfileCount}</dd>
        </div>
      </dl>

      {environmentsError ? (
        <div role="alert" className="border-destructive/30 bg-destructive/[0.07] rounded-lg border px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Unable to load environments</h2>
          <p className="mt-1 text-sm text-zinc-400">{environmentsError}</p>
        </div>
      ) : environmentsData.length === 0 ? (
        <div className="flex min-h-[24rem] items-center justify-center rounded-lg border border-dashed border-white/[0.1] bg-white/[0.015]">
          <EmptyState
            icon={<Server className="size-8" />}
            title="No environments found"
            description="Create an environment to make a runtime endpoint available to test execution."
            createRoute="/environments/create"
            createText="Create environment"
          />
        </div>
      ) : (
        <EnvironmentRegistry environments={environmentsData} />
      )}
    </div>
  )
}

export default Environments
