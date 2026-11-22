'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { useState } from 'react'

import Logo from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

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

function MobileNavigationItem({
  item,
  pathname,
  onNavigate,
  projectId,
}: {
  item: NavigationCommandItem
  pathname: string
  onNavigate: () => void
  projectId?: string
}) {
  const Icon = item.icon
  const active = isNavigationItemActive(pathname, item.href)

  return (
    <Link
      href={projectScopedHref(item.href, projectId)}
      aria-current={active ? 'page' : undefined}
      className="app-nav-item app-focus flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      data-active={active}
      onClick={onNavigate}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {item.label}
    </Link>
  )
}

export default function MobileNavigation({
  providerRunsEnabled = false,
  projects = [],
  cookieProjectId,
}: ProjectNavigationProps) {
  const { pathname, projectId, sections } = useProjectNavigationState({
    providerRunsEnabled,
    projects,
    cookieProjectId,
  })
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="app-glass flex h-12 items-center justify-between border-b px-3">
        <Link
          href={projectScopedHref('/', projectId)}
          aria-label="AppraiseJS dashboard"
          className="app-focus flex min-h-11 items-center rounded-lg"
        >
          <Logo compact />
        </Link>
        <DialogTrigger
          render={<Button variant="ghost" size="icon" className="size-11" aria-label="Open navigation menu" />}
        >
          <Menu className="size-4" aria-hidden="true" />
        </DialogTrigger>
      </div>
      <DialogContent className="left-0 top-0 h-dvh w-[min(20rem,calc(100vw-2.5rem))] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-y-0 border-l-0 p-0 sm:rounded-none">
        <DialogTitle className="sr-only">Navigation menu</DialogTitle>
        <DialogDescription className="sr-only">Navigate AppraiseJS or open the command palette.</DialogDescription>
        <div className="border-b border-border px-4 py-3 pr-12">
          <Logo compact />
        </div>
        <div className="px-3 py-2">
          <ProjectSelector projects={projects} cookieProjectId={cookieProjectId} className="mb-2 h-11 text-sm" />
          <NavCommand
            variant="sidebar"
            label="Search"
            providerRunsEnabled={providerRunsEnabled}
            className="h-11 w-full text-sm"
          />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary navigation">
          <NavigationSections
            sections={sections}
            renderItem={item => (
              <MobileNavigationItem
                key={item.href}
                item={item}
                pathname={pathname}
                projectId={projectId}
                onNavigate={() => setOpen(false)}
              />
            )}
          />
        </nav>
      </DialogContent>
    </Dialog>
  )
}
