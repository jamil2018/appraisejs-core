import { redirect } from 'next/navigation'

import { requireActiveProject } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams
  const activeProject = await requireActiveProject(project)
  redirect(withProjectScope('/quality-journeys/new', activeProject.id))
}
