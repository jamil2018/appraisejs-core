import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { getQualityJourneyDraft } from '@/services/coordinator/quality-journey-draft-service'
import { listEnvironments } from '@/services/environment/environment-service'
import { QualityJourneyCreateForm } from '../../quality-journey-create-form'

export const metadata: Metadata = { title: 'Quality Journey draft' }

type Draft = Awaited<ReturnType<typeof getQualityJourneyDraft>>
type Environment = Awaited<ReturnType<typeof listEnvironments>>[number]

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

function EditableDraft({
  draft,
  environments,
  projectId,
}: {
  draft: Draft
  environments: Environment[]
  projectId: string
}) {
  return (
    <main className="mx-auto max-w-5xl py-6">
      <QualityJourneyCreateForm
        draft={draft}
        initialEnvironments={environments.map(environment => ({
          id: environment.id,
          name: environment.name,
          baseUrl: environment.baseUrl,
        }))}
        projectId={projectId}
      />
    </main>
  )
}

function DraftExperience(props: { draft: Draft; environments: Environment[]; projectId: string }) {
  if (props.draft.status === 'CONFIRMED') return <ConfirmedDraft draft={props.draft} projectId={props.projectId} />
  return <EditableDraft {...props} />
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
  const result = await Promise.all([
    getQualityJourneyDraft({ draftId, targetProjectId: project.id }),
    listEnvironments(project.id),
  ]).catch(() => null)
  if (!result) notFound()
  const [draft, environments] = result
  return <DraftExperience draft={draft} environments={environments} projectId={project.id} />
}
