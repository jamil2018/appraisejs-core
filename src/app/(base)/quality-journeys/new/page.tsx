import type { Metadata } from 'next'
import { requireActiveProject } from '@/lib/active-project'
import { listEnvironments } from '@/services/environment/environment-service'
import { QualityJourneyCreateForm } from '../quality-journey-create-form'

export const metadata: Metadata = { title: 'New Quality Journey', description: 'Create a saved Quality Journey brief.' }

export default async function NewQualityJourneyPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; predecessor?: string }>
}) {
  const params = await searchParams
  const project = await requireActiveProject(params?.project)
  const environments = await listEnvironments(project.id)
  return (
    <main className="mx-auto max-w-5xl py-6">
      <QualityJourneyCreateForm
        initialEnvironments={environments.map(environment => ({
          id: environment.id,
          name: environment.name,
          baseUrl: environment.baseUrl,
        }))}
        predecessorJourneyId={params?.predecessor}
        projectId={project.id}
      />
    </main>
  )
}
