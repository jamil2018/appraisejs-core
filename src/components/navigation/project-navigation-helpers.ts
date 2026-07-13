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

export function useProjectNavigationState({ providerRunsEnabled = false, cookieProjectId }: ProjectNavigationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return {
    pathname,
    projectId: searchParams.get('project') ?? cookieProjectId,
    sections: getSidebarNavigationSections({ providerRunsEnabled }),
  }
}
;('use client')

import { usePathname, useSearchParams } from 'next/navigation'

import { getSidebarNavigationSections } from './nav-command-helpers'
