import type { Metadata } from 'next'
import { Settings2 } from 'lucide-react'
import PageHeader from '@/components/typography/page-header'
import { SettingsSyncPanel } from './settings-sync-panel'
import { SettingsCodingAgentsPanel } from './settings-coding-agents-panel'
import { getSyncPendingCounts } from '@/lib/sync/sync-pending-counts'
import { listProviderRegistrations } from '@/services/coordinator/coordinator-provider-run-service'

export const metadata: Metadata = {
  title: 'Appraise | Settings',
  description: 'Manage sync operations and other application settings.',
}

export default async function SettingsPage() {
  const [pendingCounts, providers] = await Promise.all([getSyncPendingCounts(), listProviderRegistrations()])
  const serializedProviders = providers.map(provider => ({
    ...provider,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
    lastProbedAt: provider.lastProbedAt?.toISOString() ?? null,
  }))

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Settings2 className="mr-2 size-8" />
            Settings
          </span>
        </PageHeader>
      </div>
      <section className="max-w-6xl">
        <div className="space-y-6">
          <SettingsCodingAgentsPanel providers={serializedProviders} />
          <SettingsSyncPanel key={JSON.stringify(pendingCounts)} pendingCounts={pendingCounts} />
        </div>
      </section>
    </div>
  )
}
