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
    <div className="pb-10">
      <div className="mb-7">
        <PageHeader>
          <span className="flex items-center gap-3">
            <span className="border-primary/20 bg-primary/[0.07] flex size-10 items-center justify-center rounded-lg border text-primary">
              <Waypoints className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            Environments
          </span>
        </PageHeader>
        <HeaderSubtitle>Define the runtime endpoints and access profiles used during test execution.</HeaderSubtitle>
      </div>

      <dl
        aria-label="Environment overview"
        className="mb-6 grid grid-cols-2 border-y border-white/[0.08] bg-white/[0.015] sm:grid-cols-4"
      >
        <div className="col-span-2 px-4 py-4 sm:col-span-1 sm:px-5">
          <dt className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Server className="size-3.5" aria-hidden="true" />
            Registered
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{environmentsData.length}</dd>
        </div>
        <div className="border-l border-white/[0.07] px-4 py-4 sm:px-5">
          <dt className="text-xs font-medium text-zinc-500">Base endpoints</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{environmentsData.length}</dd>
        </div>
        <div className="border-l border-white/[0.07] px-4 py-4 sm:px-5">
          <dt className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Braces className="size-3.5" aria-hidden="true" />
            API endpoints
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{apiEndpointCount}</dd>
        </div>
        <div className="border-l border-white/[0.07] px-4 py-4 sm:px-5">
          <dt className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <KeyRound className="size-3.5" aria-hidden="true" />
            Access profiles
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{accessProfileCount}</dd>
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
