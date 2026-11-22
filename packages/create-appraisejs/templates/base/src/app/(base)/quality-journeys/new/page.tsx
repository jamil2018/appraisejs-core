import type { Metadata } from 'next'
import { requireActiveProject } from '@/lib/active-project'
import { QualityJourneyCreateForm } from '../quality-journey-create-form'

export const metadata: Metadata = { title: 'New Quality Journey', description: 'Create a saved Quality Journey brief.' }

export default async function NewQualityJourneyPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; predecessor?: string }>
}) {
  const params = await searchParams
  const project = await requireActiveProject(params?.project)
  return <QualityJourneyCreateForm predecessorJourneyId={params?.predecessor} projectId={project.id} />
}
