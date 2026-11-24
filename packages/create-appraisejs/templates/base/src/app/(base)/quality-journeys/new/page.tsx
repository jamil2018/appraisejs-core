import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireActiveProject } from '@/lib/active-project'
import { journeyRecordReferenceSchema } from '@/lib/quality-journey/record-context'
import { loadJourneyRecordContext } from '@/services/coordinator/quality-journey-record-context'
import { QualityJourneyCreateForm } from '../quality-journey-create-form'
import { BriefAttention } from './brief-attention'

export const metadata: Metadata = { title: 'New Quality Journey', description: 'Create a saved Quality Journey brief.' }

type BriefParams = { project?: string; predecessor?: string; kind?: string; record?: string }

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
  return (
    <>
      <QualityJourneyCreateForm
        key={JSON.stringify([project.id, params.predecessor, context])}
        predecessorJourneyId={params.predecessor}
        projectId={project.id}
        recordContext={context}
      />
      {context ? null : <BriefAttention projectId={project.id} />}
    </>
  )
}
