'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { selectTargetProjectAction } from '@/actions/target-project/target-project-actions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ProjectOption = { id: string; displayName: string; canonicalPath: string }

const COLLECTION_ROUTES = new Set([
  'environments',
  'locator-groups',
  'locators',
  'modules',
  'reports',
  'tags',
  'step-definitions',
  'template-test-cases',
  'test-cases',
  'test-runs',
  'test-suites',
])

function equivalentProjectRoute(pathname: string) {
  const [segment] = pathname.split('/').filter(Boolean)
  if (segment === 'quality-journeys' && pathname !== '/quality-journeys/new') return '/quality-journeys'
  if (segment === 'conversations') return '/conversations'
  return segment && COLLECTION_ROUTES.has(segment) ? `/${segment}` : pathname
}

export default function ProjectSelector({
  projects,
  cookieProjectId,
  className,
}: {
  projects: ProjectOption[]
  cookieProjectId?: string
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { push } = useRouter()
  const [isPending, startTransition] = useTransition()
  const urlProjectId = searchParams.get('project')
  const validUrlProject = projects.some(project => project.id === urlProjectId)
  const validCookieProject = projects.some(project => project.id === cookieProjectId)
  const activeProjectId = validUrlProject
    ? urlProjectId!
    : urlProjectId
      ? null
      : validCookieProject
        ? cookieProjectId!
        : null
  return (
    <Select
      value={activeProjectId}
      items={projects.map(project => ({ value: project.id, label: project.displayName }))}
      disabled={isPending || projects.length === 0}
      onValueChange={targetProjectId =>
        startTransition(async () => {
          const response = await selectTargetProjectAction({ targetProjectId })
          if (!response.success) return
          const params = new URLSearchParams()
          params.set('project', targetProjectId)
          push(`${equivalentProjectRoute(pathname)}?${params.toString()}`)
        })
      }
    >
      <SelectTrigger className={className} aria-label="Active project">
        <SelectValue placeholder={projects.length ? 'Select project' : 'Register a project'} />
      </SelectTrigger>
      <SelectContent>
        {projects.map(project => (
          <SelectItem key={project.id} value={project.id} title={project.canonicalPath}>
            {project.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
