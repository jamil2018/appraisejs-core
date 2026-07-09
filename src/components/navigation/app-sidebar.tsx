'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import Logo from '@/components/logo'

import NavCommand from './nav-command'
import { getSidebarNavigationSections, type NavigationCommandItem } from './nav-command-helpers'

type AppSidebarProps = {
  providerRunsEnabled?: boolean
}

function isItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function ariaCurrent(active: boolean) {
  return active ? 'page' : undefined
}

function SidebarNavItem({ item, pathname }: { item: NavigationCommandItem; pathname: string }) {
  const Icon = item.icon
  const active = isItemActive(pathname, item.href)

  return (
    <Link
      href={item.href}
      data-active={active}
      className="hover:text-foreground/90 focus-visible:ring-sidebar-ring group relative flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-5 text-muted-foreground outline-none transition-colors hover:bg-white/[0.045] focus-visible:ring-1 data-[active=true]:bg-white/[0.085] data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.07)]"
      aria-current={ariaCurrent(active)}
    >
      <span
        className="absolute bottom-2 left-0 top-2 hidden w-px rounded-full bg-primary group-data-[active=true]:block"
        aria-hidden="true"
      />
      <Icon
        className="text-muted-foreground/75 group-hover:text-foreground/85 size-4 shrink-0 group-data-[active=true]:text-primary"
        strokeWidth={1.9}
      />
      <span className="min-w-0 flex-1">{item.label}</span>
    </Link>
  )
}

export default function AppSidebar({ providerRunsEnabled = false }: AppSidebarProps) {
  const pathname = usePathname()
  const sections = getSidebarNavigationSections({ providerRunsEnabled })

  return (
    <aside
      className="sticky top-0 z-40 flex w-full shrink-0 flex-col border-b border-white/[0.08] bg-white/[0.015] lg:h-screen lg:max-h-screen lg:w-[15.75rem] lg:border-b-0 lg:border-r lg:border-white/[0.08]"
      data-persistent-navigation
      style={{
        background:
          'linear-gradient(180deg, rgba(38, 83, 121, 0.34) 0%, rgba(18, 37, 64, 0.27) 34%, rgba(13, 20, 34, 0.46) 100%)',
      }}
    >
      <div className="flex shrink-0 items-center px-3 pb-0.5 pt-3">
        <Link
          href="/"
          className="focus-visible:ring-sidebar-ring rounded-md outline-none focus-visible:ring-1"
          aria-label="AppraiseJS dashboard"
        >
          <Logo compact />
        </Link>
      </div>

      <div className="shrink-0 px-3 py-1.5">
        <NavCommand
          variant="sidebar"
          label="Search"
          className="h-8 w-full min-w-0 border border-white/[0.08] bg-white/[0.055] px-2.5 text-xs font-normal text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-10px_24px_rgba(0,0,0,0.16)] transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.075] hover:text-foreground"
          providerRunsEnabled={providerRunsEnabled}
        />
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3 [scrollbar-color:rgba(255,255,255,0.12)_transparent] [scrollbar-width:thin] lg:pb-2"
        aria-label="Primary navigation"
      >
        <div className="space-y-3.5">
          {sections.map(section => (
            <section key={section.label}>
              <h2 className="text-muted-foreground/70 mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                {section.label}
              </h2>
              <div className="space-y-px">
                {section.items.map(item => (
                  <SidebarNavItem key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>

      <div className="hidden shrink-0 border-t border-white/[0.08] bg-white/[0.025] px-3 py-2.5 lg:block">
        <p className="text-muted-foreground/80 flex items-center gap-2 text-[11px] leading-4">
          <span className="bg-primary/75 size-1.5 shrink-0 rounded-full" aria-hidden="true" />
          <span>Local-first workspace</span>
        </p>
      </div>
    </aside>
  )
}
