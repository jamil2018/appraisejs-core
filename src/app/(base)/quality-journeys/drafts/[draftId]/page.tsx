import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { getQualityJourneyDraft } from '@/services/coordinator/quality-journey-draft-service'
import { getManagedJourneyProviderReadiness } from '@/services/coordinator/app-managed-journey-readiness'
import { QualityJourneyCreateForm } from '../../quality-journey-create-form'

export const metadata: Metadata = { title: 'Quality Journey draft' }

type Draft = Awaited<ReturnType<typeof getQualityJourneyDraft>>

function ConfirmedDraft({ draft, projectId }: { draft: Draft; projectId: string }) {
  return (
    <p className="text-sm">
      This draft is confirmed. Its Journey is{' '}
      <a
        className="text-primary underline"
        href={`/quality-journeys/${draft.confirmedJourneyId}?project=${encodeURIComponent(projectId)}`}
      >
        available here
      </a>
      .
    </p>
  )
}

export default async function QualityJourneyDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftId: string }>
  searchParams?: Promise<{ project?: string; assistant?: string }>
}) {
  const [{ draftId }, queryValue] = await Promise.all([params, searchParams])
  const query = queryValue ?? {}
  const project = await requireActiveProject(query.project)
  const draft = await getQualityJourneyDraft({ draftId, targetProjectId: project.id }).catch(() => null)
  if (!draft) notFound()
  if (draft.status === 'CONFIRMED') return <ConfirmedDraft draft={draft} projectId={project.id} />
  const providerReadiness = await getManagedJourneyProviderReadiness({
    targetProjectId: project.id,
    returnTo: `/quality-journeys/drafts/${encodeURIComponent(draftId)}?project=${encodeURIComponent(project.id)}`,
  })
  const preferredProvider =
    (query.assistant === 'CODEX' || query.assistant === 'CLAUDE_CODE') && providerReadiness[query.assistant].ready
      ? query.assistant
      : undefined
  return (
    <QualityJourneyCreateForm
      key={`${draft.id}:${preferredProvider ?? ''}`}
      draft={draft}
      preferredProvider={preferredProvider}
      projectId={project.id}
      providerReadiness={providerReadiness}
    />
  )
}
