'use client'

import Link from 'next/link'

import Logo from '@/components/logo'

import NavCommand from './nav-command'
import NavigationSections from './navigation-sections'
import ProjectSelector from './project-selector'
import type { NavigationCommandItem } from './nav-command-helpers'
import {
  isNavigationItemActive,
  projectScopedHref,
  type ProjectNavigationProps,
  useProjectNavigationState,
} from './project-navigation-helpers'

function ariaCurrent(active: boolean) {
  return active ? 'page' : undefined
}

function SidebarNavItem({
  item,
  pathname,
  projectId,
}: {
  item: NavigationCommandItem
  pathname: string
  projectId?: string
}) {
  const Icon = item.icon
  const active = isNavigationItemActive(pathname, item.href)

  return (
    <Link
      href={projectScopedHref(item.href, projectId)}
      data-active={active}
      className="app-focus group flex min-h-8 items-center gap-2 rounded-lg px-2 py-1 text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-foreground"
      aria-current={ariaCurrent(active)}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <span className="min-w-0 flex-1">{item.label}</span>
    </Link>
  )
}

export default function AppSidebar({
  providerRunsEnabled = false,
  projects = [],
  cookieProjectId,
}: ProjectNavigationProps) {
  const { pathname, projectId, sections } = useProjectNavigationState({
    providerRunsEnabled,
    projects,
    cookieProjectId,
  })

  return (
    <aside
      className="app-glass sticky top-0 z-40 hidden h-dvh w-60 shrink-0 flex-col overflow-hidden border-r lg:flex"
      data-persistent-navigation
    >
      <div className="flex shrink-0 items-center px-4 pb-2 pt-4">
        <Link
          href={projectScopedHref('/', projectId)}
          className="app-focus rounded-lg"
          aria-label="AppraiseJS dashboard"
        >
          <Logo compact />
        </Link>
      </div>

      <div className="grid shrink-0 gap-2 px-3 pb-4">
        <ProjectSelector projects={projects} cookieProjectId={cookieProjectId} className="h-8 text-xs" />
        <NavCommand
          variant="sidebar"
          label="Search"
          className="h-8 w-full min-w-0 px-2 text-xs font-normal text-muted-foreground"
          providerRunsEnabled={providerRunsEnabled}
        />
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        aria-label="Primary navigation"
      >
        <NavigationSections
          sections={sections}
          renderItem={item => <SidebarNavItem key={item.href} item={item} pathname={pathname} projectId={projectId} />}
        />
      </nav>
    </aside>
  )
}
