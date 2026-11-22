import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { getQualityJourneyDraft } from '@/services/coordinator/quality-journey-draft-service'
import { QualityJourneyCreateForm } from '../../quality-journey-create-form'

export const metadata: Metadata = { title: 'Quality Journey draft' }

type Draft = Awaited<ReturnType<typeof getQualityJourneyDraft>>

function ConfirmedDraft({ draft, projectId }: { draft: Draft; projectId: string }) {
  return (
    <main className="p-6 text-sm">
      This draft is confirmed. Its Journey is{' '}
      <a
        className="text-primary underline"
        href={`/quality-journeys/${draft.confirmedJourneyId}?project=${encodeURIComponent(projectId)}`}
      >
        available here
      </a>
      .
    </main>
  )
}

function EditableDraft({ draft, projectId }: { draft: Draft; projectId: string }) {
  return (
    <main className="mx-auto max-w-5xl pb-10">
      <QualityJourneyCreateForm draft={draft} projectId={projectId} />
    </main>
  )
}

export default async function QualityJourneyDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftId: string }>
  searchParams?: Promise<{ project?: string }>
}) {
  const [{ draftId }, queryValue] = await Promise.all([params, searchParams])
  const query = queryValue ?? {}
  const project = await requireActiveProject(query.project)
  const draft = await getQualityJourneyDraft({ draftId, targetProjectId: project.id }).catch(() => null)
  if (!draft) notFound()
  if (draft.status === 'CONFIRMED') return <ConfirmedDraft draft={draft} projectId={project.id} />
  return <EditableDraft draft={draft} projectId={project.id} />
}
