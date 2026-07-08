'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import {
  Blocks,
  Bot,
  Code,
  Component,
  FileCheck,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Network,
  Puzzle,
  Server,
  Settings2,
  Tag,
  TestTubeDiagonal,
  TestTubes,
  type LucideIcon,
} from 'lucide-react'

import Logo from '@/components/logo'
import { cn } from '@/lib/utils'

import NavCommand from './nav-command'

type SidebarItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  accentColor: string
}

type SidebarItemStyle = CSSProperties & {
  '--sidebar-item-accent': string
}

type SidebarSection = {
  label: string
  items: SidebarItem[]
}

type AppSidebarProps = {
  providerRunsEnabled?: boolean
}

const sidebarSections = ({ providerRunsEnabled = false }: AppSidebarProps): SidebarSection[] => [
  {
    label: 'Control',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        description: 'Health and velocity',
        icon: LayoutDashboard,
        accentColor: '#6ee7b7',
      },
      {
        href: '/plans',
        label: 'Plans',
        description: 'Review and approve work',
        icon: Network,
        accentColor: '#67e8f9',
      },
      ...(providerRunsEnabled
        ? [
            {
              href: '/provider-runs',
              label: 'Provider Runs',
              description: 'Agent execution trace',
              icon: Bot,
              accentColor: '#c4b5fd',
            },
          ]
        : []),
    ],
  },
  {
    label: 'Execution',
    items: [
      {
        href: '/test-runs',
        label: 'Test Runs',
        description: 'Launch and monitor',
        icon: ListChecks,
        accentColor: '#bef264',
      },
      {
        href: '/reports',
        label: 'Reports',
        description: 'Read the evidence',
        icon: FileCheck,
        accentColor: '#7dd3fc',
      },
      {
        href: '/test-suites',
        label: 'Test Suites',
        description: 'Ship runnable bundles',
        icon: TestTubes,
        accentColor: '#5eead4',
      },
      {
        href: '/test-cases',
        label: 'Test Cases',
        description: 'Author scenarios',
        icon: TestTubeDiagonal,
        accentColor: '#fcd34d',
      },
    ],
  },
  {
    label: 'Library',
    items: [
      {
        href: '/template-steps',
        label: 'Template Steps',
        description: 'Reusable actions',
        icon: LayoutTemplate,
        accentColor: '#f0abfc',
      },
      {
        href: '/template-step-groups',
        label: 'Step Groups',
        description: 'Reusable clusters',
        icon: Component,
        accentColor: '#a5b4fc',
      },
      {
        href: '/step-blocks',
        label: 'Step Blocks',
        description: 'Ordered sequences',
        icon: Blocks,
        accentColor: '#fdba74',
      },
      {
        href: '/template-test-cases',
        label: 'Case Templates',
        description: 'Scenario blueprints',
        icon: Blocks,
        accentColor: '#fda4af',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/locators',
        label: 'Locators',
        description: 'Selectors',
        icon: Code,
        accentColor: '#fde047',
      },
      {
        href: '/locator-groups',
        label: 'Locator Groups',
        description: 'Selector maps',
        icon: Group,
        accentColor: '#93c5fd',
      },
      {
        href: '/modules',
        label: 'Modules',
        description: 'Product areas',
        icon: Puzzle,
        accentColor: '#d8b4fe',
      },
      {
        href: '/environments',
        label: 'Environments',
        description: 'Runtime targets',
        icon: Server,
        accentColor: '#86efac',
      },
      {
        href: '/tags',
        label: 'Tags',
        description: 'Filtering vocabulary',
        icon: Tag,
        accentColor: '#fca5a5',
      },
      {
        href: '/settings',
        label: 'Settings',
        description: 'Workspace controls',
        icon: Settings2,
        accentColor: '#e4e4e7',
      },
    ],
  },
]

function isItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function ariaCurrent(active: boolean) {
  return active ? 'page' : undefined
}

function SidebarNavItem({ item, pathname }: { item: SidebarItem; pathname: string }) {
  const Icon = item.icon
  const active = isItemActive(pathname, item.href)
  const accentStyle: SidebarItemStyle = { '--sidebar-item-accent': item.accentColor }

  return (
    <Link
      href={item.href}
      data-active={active}
      className="focus-visible:ring-primary/70 group flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 data-[active=true]:bg-white/[0.08] data-[active=true]:text-white"
      aria-current={ariaCurrent(active)}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors data-[active=true]:border-white/20 data-[active=true]:bg-[var(--sidebar-item-accent)] data-[active=true]:text-zinc-950"
        data-active={active}
        style={accentStyle}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium leading-5">{item.label}</span>
        <span className="hidden truncate text-xs leading-4 text-zinc-500 group-hover:text-zinc-400 sm:block lg:hidden">
          {item.description}
        </span>
      </span>
    </Link>
  )
}

export default function AppSidebar({ providerRunsEnabled = false }: AppSidebarProps) {
  const pathname = usePathname()
  const sections = sidebarSections({ providerRunsEnabled })

  return (
    <aside
      className="sticky top-0 z-40 flex w-full shrink-0 flex-col border-b border-white/10 bg-[#10131b]/95 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl lg:h-screen lg:max-h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-4"
      data-persistent-navigation
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 lg:block">
        <Link
          href="/"
          className="focus-visible:ring-primary/70 -ml-2 rounded-md outline-none focus-visible:ring-2"
          aria-label="AppraiseJS dashboard"
        >
          <Logo />
        </Link>
        <div className="hidden rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-100 lg:inline-flex">
          Local-first
        </div>
      </div>

      <div className="mt-3">
        <NavCommand
          className="h-9 w-full border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-200 shadow-none hover:bg-white/[0.08]"
          providerRunsEnabled={providerRunsEnabled}
        />
      </div>

      <nav className="mt-3 overflow-y-auto pb-12 pr-1 lg:pb-3" aria-label="Primary navigation">
        <div className="grid gap-3 sm:grid-cols-2 lg:block lg:space-y-3">
          {sections.map(section => {
            const sectionActive = section.items.some(item => isItemActive(pathname, item.href))

            return (
              <section
                key={section.label}
                className={cn(
                  'relative rounded-md border border-transparent p-1',
                  sectionActive && 'border-white/10 bg-white/[0.025]',
                )}
              >
                {sectionActive ? (
                  <span
                    className="absolute -left-1 top-7 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b from-emerald-300 via-cyan-300 to-transparent lg:block"
                    aria-hidden="true"
                  />
                ) : null}
                <h2 className="mb-1 px-2 text-[0.68rem] font-semibold uppercase text-zinc-500">{section.label}</h2>
                <div className="space-y-1">
                  {section.items.map(item => (
                    <SidebarNavItem key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
