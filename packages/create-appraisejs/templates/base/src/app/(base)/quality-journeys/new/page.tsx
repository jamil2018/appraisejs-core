import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { journeyRecordReferenceSchema } from '@/lib/quality-journey/record-context'
import { loadJourneyRecordContext } from '@/services/coordinator/quality-journey-record-context'
import { getManagedJourneyProviderReadiness } from '@/services/coordinator/app-managed-journey-readiness'
import { QualityJourneyCreateForm } from '../quality-journey-create-form'
import { BriefAttention } from './brief-attention'

export const metadata: Metadata = { title: 'New Quality Journey', description: 'Create a saved Quality Journey brief.' }

type BriefParams = { project?: string; predecessor?: string; kind?: string; record?: string; assistant?: string }

function requestedRecord({ kind, record }: BriefParams) {
  if (kind === undefined && record === undefined) return undefined
  const reference = journeyRecordReferenceSchema.safeParse({ kind, id: record })
  if (!reference.success) notFound()
  return reference.data
}

async function resolveBriefContext(projectId: string, params: BriefParams) {
  const reference = requestedRecord(params)
  if (!reference) return undefined
  return (await loadJourneyRecordContext(projectId, reference)) ?? notFound()
}

export default async function NewQualityJourneyPage({ searchParams }: { searchParams?: Promise<BriefParams> }) {
  const params = (await searchParams) ?? {}
  const project = await requireActiveProject(params.project)
  const context = await resolveBriefContext(project.id, params)
  const returnParams = new URLSearchParams({ project: project.id })
  if (params.predecessor) returnParams.set('predecessor', params.predecessor)
  if (params.kind) returnParams.set('kind', params.kind)
  if (params.record) returnParams.set('record', params.record)
  const providerReadiness = await getManagedJourneyProviderReadiness({
    targetProjectId: project.id,
    returnTo: `/quality-journeys/new?${returnParams}`,
  })
  const preferredProvider =
    (params.assistant === 'CODEX' || params.assistant === 'CLAUDE_CODE') && providerReadiness[params.assistant].ready
      ? params.assistant
      : !providerReadiness.CODEX.ready && providerReadiness.CLAUDE_CODE.ready
        ? 'CLAUDE_CODE'
        : undefined
  return (
    <>
      <QualityJourneyCreateForm
        key={JSON.stringify([project.id, params.predecessor, context, preferredProvider])}
        predecessorJourneyId={params.predecessor}
        preferredProvider={preferredProvider}
        projectId={project.id}
        providerReadiness={providerReadiness}
        recordContext={context}
      />
      {context ? null : <BriefAttention projectId={project.id} />}
    </>
  )
}
