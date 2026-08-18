'use client'

import { usePathname, useSearchParams } from 'next/navigation'

import { getSidebarNavigationSections } from './nav-command-helpers'

export type ProjectNavigationProps = {
  providerRunsEnabled?: boolean
  projects?: Array<{ id: string; displayName: string; canonicalPath: string }>
  cookieProjectId?: string
}

export function isNavigationItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function projectScopedHref(href: string, projectId?: string) {
  return projectId ? `${href}?project=${encodeURIComponent(projectId)}` : href
}

export function resolveNavigationProjectId(
  projects: ProjectNavigationProps['projects'],
  urlProjectId?: string | null,
  cookieProjectId?: string,
) {
  const candidate = urlProjectId ?? cookieProjectId
  return candidate && projects?.some(project => project.id === candidate) ? candidate : undefined
}

export function useProjectNavigationState({
  providerRunsEnabled = false,
  projects,
  cookieProjectId,
}: ProjectNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return {
    pathname,
    projectId: resolveNavigationProjectId(projects, searchParams.get('project'), cookieProjectId),
    sections: getSidebarNavigationSections({ providerRunsEnabled }),
  }
}
