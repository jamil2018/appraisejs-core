import type { Metadata } from 'next'
import { ClipboardCheck } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { requireActiveProject } from '@/lib/active-project'
import { listQualityAssessments } from '@/services/coordinator/quality-design-service'

import { AssessmentsBrowser } from './assessments-browser'

export const metadata: Metadata = {
  title: 'Assessments',
  description: 'Review immutable subjects, sealed evidence, readiness, and quality decisions.',
}

export default async function AssessmentsPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  const parameters = await searchParams
  const project = await requireActiveProject(parameters?.project)
  const assessments = await listQualityAssessments({ targetProjectId: project.id })

  return (
    <main className="space-y-5 pb-10">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <PageHeader>
            <span className="flex items-center gap-3">
              <ClipboardCheck aria-hidden="true" className="size-7 text-primary sm:size-8" strokeWidth={2.2} />
              Assessments
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Immutable subjects, sealed evidence, readiness checks, and recorded quality decisions.
          </HeaderSubtitle>
        </div>
        <Badge
          className="mt-1 border-white/[0.1] bg-white/[0.035] px-3 py-1 text-xs font-semibold text-zinc-200"
          variant="outline"
        >
          {assessments.length} assessments
        </Badge>
      </header>
      <AssessmentsBrowser assessments={assessments} />
    </main>
  )
}
