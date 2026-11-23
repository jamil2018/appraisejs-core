'use client'

import {
  ArrowDownWideNarrow,
  ChevronRight,
  Folder,
  Layers3,
  MessagesSquare,
  Plug,
  Plus,
  Search,
  Settings,
  SquarePen,
} from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import Logo from '@/components/logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { displayStageForQualityJourney, qualityJourneyLabel } from '@/lib/quality-journey/presentation'
import { withProjectScope } from '@/lib/project-scope'
import type { JourneyNavigationItem } from '@/services/coordinator/quality-journey-query-service'

import NavCommand from './nav-command'
import NavigationSections from './navigation-sections'
import ProjectSelector from './project-selector'
import type { NavigationCommandItem, NavigationSection } from './nav-command-helpers'
import {
  emptyNavigationProjects,
  isNavigationItemActive,
  projectScopedHref,
  type ProjectNavigationProps,
  useProjectNavigationState,
} from './project-navigation-helpers'

type AppSidebarProps = ProjectNavigationProps & {
  recentJourneys?: Record<string, JourneyNavigationItem[]>
}

const areas = [
  { id: 'chats', label: 'Chats', href: '/quality-journeys/new', Icon: MessagesSquare },
  { id: 'workspace', label: 'Workspace', href: '/dashboard', Icon: Layers3 },
  { id: 'integrations', label: 'Integrations', href: '/collaboration', Icon: Plug },
  { id: 'settings', label: 'Settings', href: '/settings', Icon: Settings },
] as const

type SidebarArea = (typeof areas)[number]['id']

const routeAreas = new Map<string, SidebarArea>([
  ['/', 'chats'],
  ['/quality-journeys', 'chats'],
  ['/collaboration', 'integrations'],
  ['/settings', 'settings'],
  ['/help', 'settings'],
])

function currentArea(pathname: string, agentSetup: boolean): SidebarArea {
  if (pathname === '/projects' && agentSetup) return 'integrations'
  const sectionPath = pathname.replace(/^\/quality-journeys\/.*$/, '/quality-journeys')
  return routeAreas.get(sectionPath) ?? 'workspace'
}

const setupPaths = new Set(['/locators', '/locator-groups', '/environments'])
const authoringPaths = new Set(['/test-cases', '/test-suites'])
const attentionStatuses = new Set(['ANALYSIS_REVIEW', 'SCENARIO_REVIEW', 'REPORT_REVIEW', 'BLOCKED', 'PAUSED'])
const emptyRecentJourneys: Record<string, JourneyNavigationItem[]> = {}

function workspaceSections([control, execution, library, system]: NavigationSection[]): NavigationSection[] {
  return [
    { label: 'Workspace', items: control.items.filter(item => item.href === '/dashboard') },
    {
      label: 'Authoring',
      items: [
        ...execution.items.filter(item => authoringPaths.has(item.href)),
        ...library.items.filter(item => !setupPaths.has(item.href)),
      ],
    },
    { label: 'Execution', items: execution.items.filter(item => !authoringPaths.has(item.href)) },
    {
      label: 'Setup',
      items: [
        ...library.items.filter(item => setupPaths.has(item.href)),
        ...system.items.filter(item => item.href === '/projects'),
      ],
    },
  ]
}

const navLinkClass =
  'app-nav-item app-focus flex min-h-7 min-w-0 items-center gap-2 rounded-xl px-2 py-0.5 text-left text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

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

  return (
    <Link
      href={projectScopedHref(item.href, projectId)}
      className={navLinkClass}
      aria-current={isNavigationItemActive(pathname, item.href) ? 'page' : undefined}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <span className="min-w-0 flex-1">{item.label}</span>
    </Link>
  )
}

function recentJourneyStatus(item: JourneyNavigationItem, needsAttention: boolean) {
  if (item.kind === 'draft') return 'Draft'
  return needsAttention ? qualityJourneyLabel(item.status) : displayStageForQualityJourney(item.status).label
}

function RecentJourneyLink({
  item,
  projectId,
  activePath,
}: {
  item: JourneyNavigationItem
  projectId: string
  activePath?: string
}) {
  const id = encodeURIComponent(item.id)
  const path = item.kind === 'draft' ? `/quality-journeys/drafts/${id}` : `/quality-journeys/${id}`
  const needsAttention = attentionStatuses.has(item.status)
  const status = recentJourneyStatus(item, needsAttention)

  return (
    <Link
      href={withProjectScope(path, projectId)}
      prefetch={false}
      className={navLinkClass}
      aria-current={activePath === path ? 'page' : undefined}
      title={`${item.title} · ${status}`}
    >
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {needsAttention && <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />}
      <span className="sr-only"> · {status}</span>
    </Link>
  )
}

function RecentJourneys({
  projects,
  recentJourneys,
  projectId,
  pathname,
  search,
  sort,
}: {
  projects: NonNullable<ProjectNavigationProps['projects']>
  recentJourneys: NonNullable<AppSidebarProps['recentJourneys']>
  projectId?: string
  pathname: string
  search: string
  sort: 'recent' | 'title'
}) {
  const term = search.trim().toLocaleLowerCase()
  const groups = projects.map(project => {
    const matches = (recentJourneys[project.id] ?? []).filter(item =>
      [project.displayName, item.title].some(text => text.toLocaleLowerCase().includes(term)),
    )
    return { project, items: sort === 'title' ? matches.toSorted((a, b) => a.title.localeCompare(b.title)) : matches }
  })

  return (
    <div className="space-y-2">
      {term && groups.every(group => !group.items.length) ? (
        <p className="px-2 text-sm text-muted-foreground" role="status">
          No recent Journeys found.
        </p>
      ) : null}
      {groups
        .filter(({ items }) => !term || items.length)
        .map(({ project, items }) => (
          <details
            key={project.id}
            open={Boolean(term) || project.id === projectId}
            className="group"
            data-project-journeys={project.id}
          >
            <summary className="app-focus flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 text-sm font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground group-open:rotate-90"
                aria-hidden="true"
              />
              <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate" title={project.displayName}>
                {project.displayName}
              </span>
            </summary>
            <div className="space-y-px pl-3">
              {items.map(item => (
                <RecentJourneyLink
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  projectId={project.id}
                  activePath={project.id === projectId ? pathname : undefined}
                />
              ))}
              <Link className={navLinkClass} href={withProjectScope('/quality-journeys', project.id)} prefetch={false}>
                All Journeys
              </Link>
            </div>
          </details>
        ))}
    </div>
  )
}

function SidebarQuickAction({
  area,
  pathname,
  projectId,
}: {
  area: SidebarArea
  pathname: string
  projectId?: string
}) {
  if (area === 'chats') {
    return (
      <Link className={navLinkClass} href={projectScopedHref('/quality-journeys/new', projectId)}>
        <SquarePen className="size-4" aria-hidden="true" /> New chat
      </Link>
    )
  }
  if (pathname === '/test-cases') {
    return (
      <Link className={navLinkClass} href={projectScopedHref('/test-cases/create', projectId)}>
        <Plus className="size-4" aria-hidden="true" /> New test case
      </Link>
    )
  }
  return null
}

function SectionLinks({
  area,
  sections,
  pathname,
  projectId,
}: {
  area: SidebarArea
  sections: NavigationSection[]
  pathname: string
  projectId?: string
}) {
  const [control, , , system] = sections
  const renderItem = (item: NavigationCommandItem) => (
    <SidebarNavItem key={item.href} item={item} pathname={pathname} projectId={projectId} />
  )
  if (area === 'integrations') {
    return (
      <>
        {control.items.filter(item => item.href === '/collaboration').map(renderItem)}
        <Link
          className={navLinkClass}
          href={projectId ? withProjectScope('/projects?agentSetup=codex', projectId) : '/projects?agentSetup=codex'}
        >
          <Plug className="size-4" aria-hidden="true" /> Codex setup
        </Link>
      </>
    )
  }

  const sectionLinks =
    area === 'workspace'
      ? workspaceSections(sections)
      : [{ label: 'Preferences', items: system.items.filter(item => item.href !== '/projects') }]
  return <NavigationSections sections={sectionLinks} renderItem={renderItem} />
}

function SidebarSection({
  area,
  sections,
  pathname,
  projectId,
  children,
}: {
  area: SidebarArea
  sections: NavigationSection[]
  pathname: string
  projectId?: string
  children: ReactNode
}) {
  const chats = area === 'chats'
  return (
    <nav
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-color:var(--input)_transparent] [scrollbar-width:thin]"
      aria-label={chats ? 'Recent Journeys by project' : 'Section navigation'}
    >
      {chats ? children : <SectionLinks area={area} sections={sections} pathname={pathname} projectId={projectId} />}
    </nav>
  )
}

export default function AppSidebar({
  providerRunsEnabled = false,
  projects = emptyNavigationProjects,
  cookieProjectId,
  recentJourneys = emptyRecentJourneys,
}: AppSidebarProps) {
  const { pathname, projectId, sections, searchParams } = useProjectNavigationState({
    providerRunsEnabled,
    projects,
    cookieProjectId,
  })
  const area = currentArea(pathname, searchParams.get('agentSetup') === 'codex')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [sort, setSort] = useState<'recent' | 'title'>('recent')
  const searchInput = useRef<HTMLInputElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const chats = area === 'chats'
  const searchVisible = chats && showSearch
  useEffect(() => {
    if (searchVisible) searchInput.current?.focus()
  }, [searchVisible])

  function closeSearch() {
    setShowSearch(false)
    setSearch('')
  }

  return (
    <aside className="sticky top-0 z-40 hidden h-dvh shrink-0 lg:flex" data-persistent-navigation>
      <TooltipProvider delay={150}>
        <nav
          aria-label="App sections"
          className="flex w-[3.25rem] shrink-0 flex-col items-center gap-1 border-r bg-background py-3"
        >
          {areas.map(({ id, label, href, Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <Link
                    href={projectScopedHref(href, projectId)}
                    aria-label={label}
                    aria-current={area === id ? 'true' : undefined}
                    className="app-focus grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=true]:bg-selection-surface aria-[current=true]:text-selection data-[area=settings]:mt-auto"
                    data-area={id}
                  />
                }
              >
                <Icon className="size-[1.15rem]" strokeWidth={1.8} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent role="tooltip" side="right" className="px-2 py-1">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>
      <div className="flex h-full w-[16.5rem] flex-col border-r bg-card">
        <div className="shrink-0 space-y-1 border-b px-2.5 pb-2 pt-1.5">
          <div className="flex h-8 items-center justify-between">
            <Link
              href={projectScopedHref('/', projectId)}
              className="app-focus rounded-lg"
              aria-label="AppraiseJS home"
            >
              <Logo compact />
            </Link>
            {chats ? (
              <div className="flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        className="size-7 rounded-xl"
                        variant="ghost"
                        aria-label="Sort recent Journeys"
                      />
                    }
                  >
                    <ArrowDownWideNarrow aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuCheckboxItem checked={sort === 'recent'} onCheckedChange={() => setSort('recent')}>
                      Recently updated
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={sort === 'title'} onCheckedChange={() => setSort('title')}>
                      Title A–Z
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="icon"
                  className="size-7 rounded-xl"
                  variant="ghost"
                  ref={searchTrigger}
                  aria-label="Search recent Journeys"
                  aria-expanded={showSearch}
                  aria-controls="recent-journey-search"
                  onClick={() => {
                    if (showSearch) closeSearch()
                    else setShowSearch(true)
                  }}
                >
                  <Search aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
          <SidebarQuickAction area={area} pathname={pathname} projectId={projectId} />
          <div className="flex items-center gap-1">
            <ProjectSelector
              projects={projects}
              cookieProjectId={cookieProjectId}
              className="h-8 min-w-0 flex-1 text-xs"
            />
            <NavCommand variant="icon" providerRunsEnabled={providerRunsEnabled} />
          </div>
          {searchVisible ? (
            <Input
              id="recent-journey-search"
              type="search"
              aria-label="Filter recent Journeys"
              placeholder="Search recent Journeys"
              value={search}
              ref={searchInput}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  closeSearch()
                  searchTrigger.current?.focus()
                }
              }}
            />
          ) : null}
        </div>
        <SidebarSection area={area} sections={sections} pathname={pathname} projectId={projectId}>
          <RecentJourneys
            projects={projects}
            recentJourneys={recentJourneys}
            projectId={projectId}
            pathname={pathname}
            search={search}
            sort={sort}
          />
        </SidebarSection>
      </div>
    </aside>
  )
}
