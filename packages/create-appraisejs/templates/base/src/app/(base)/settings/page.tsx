import type { Metadata } from 'next'
import { Settings2 } from 'lucide-react'
import PageHeader from '@/components/typography/page-header'

export const metadata: Metadata = {
  title: 'Appraise | Settings',
  description: 'Manage sync operations and other application settings.',
}

export default async function SettingsPage() {
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
    </div>
  )
}
