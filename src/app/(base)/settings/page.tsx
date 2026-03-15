import type { Metadata } from 'next'
import { Settings2 } from 'lucide-react'
import PageHeader from '@/components/typography/page-header'
import { SettingsSyncPanel } from './settings-sync-panel'

export const metadata: Metadata = {
  title: 'Appraise | Settings',
  description: 'Manage sync operations and other application settings.',
}

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Settings2 className="mr-2 h-8 w-8" />
            Settings
          </span>
        </PageHeader>
      </div>
      <section className="max-w-6xl">
        <SettingsSyncPanel />
      </section>
    </div>
  )
}
