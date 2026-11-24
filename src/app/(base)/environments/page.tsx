import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { CollectionHeader, CollectionResults, collectionLoadError } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { Braces, KeyRound, Plus, Server } from 'lucide-react'
import { Metadata } from 'next'
import Link from 'next/link'

import { getEnvironmentTableRows } from './environment-helpers'
import EnvironmentRegistry from './environment-registry'

export const metadata: Metadata = {
  title: 'Appraise | Environments',
  description: 'Manage test environments and their configurations',
}

function EnvironmentOverview({ environments }: { environments: ReturnType<typeof getEnvironmentTableRows> }) {
  const apiEndpointCount = environments.filter(environment => environment.apiBaseUrl).length
  const accessProfileCount = environments.filter(environment => environment.username).length
  return (
    <dl aria-label="Environment overview" className="grid grid-cols-3 gap-2">
      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Server className="size-3.5 shrink-0" aria-hidden="true" />
          Registered
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{environments.length}</dd>
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Braces className="size-3.5 shrink-0" aria-hidden="true" />
          API endpoints
        </dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground/90">{apiEndpointCount}</dd>
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
          Access profiles
        </dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground/90">{accessProfileCount}</dd>
      </div>
    </dl>
  )
}

export default async function Environments() {
  const response = await getAllEnvironmentsAction()
  const environments = getEnvironmentTableRows(response.data)
  const error = collectionLoadError(response)
  return (
    <div className="min-w-0 space-y-4">
      <CollectionHeader title="Environments">
        <Button render={<Link href="/environments/create" />} nativeButton={false} className="rounded-xl">
          <Plus aria-hidden="true" data-icon="inline-start" />
          New environment
        </Button>
      </CollectionHeader>
      <CollectionResults emptyTitle="No environments yet" errorTitle="Unable to load environments" error={error}>
        {environments.length > 0 ? (
          <>
            <EnvironmentOverview environments={environments} />
            <EnvironmentRegistry environments={environments} />
          </>
        ) : null}
      </CollectionResults>
    </div>
  )
}
