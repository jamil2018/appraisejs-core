import type { Metadata } from 'next'
import { Network } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { requireActiveProject } from '@/lib/active-project'
import { listQualityPlans } from '@/services/coordinator/quality-design-service'

import { QualityPlansBrowser } from './quality-plans-browser'

export const metadata: Metadata = {
  title: 'Quality Plans',
  description: 'Review immutable quality requirements, obligations, and validation design.',
}

export default async function QualityPlansPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  const parameters = await searchParams
  const project = await requireActiveProject(parameters?.project)
  const plans = await listQualityPlans({ targetProjectId: project.id })

  return (
    <main className="space-y-5 pb-10">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <PageHeader>
            <span className="flex items-center gap-3">
              <Network aria-hidden="true" className="size-7 text-primary sm:size-8" strokeWidth={2.2} />
              Quality Plans
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Immutable requirements, quality obligations, and validation design for this project.
          </HeaderSubtitle>
        </div>
        <Badge
          className="mt-1 border-white/[0.1] bg-white/[0.035] px-3 py-1 text-xs font-semibold text-zinc-200"
          variant="outline"
        >
          {plans.length} quality plans
        </Badge>
      </header>
      <QualityPlansBrowser plans={plans} />
    </main>
  )
}
