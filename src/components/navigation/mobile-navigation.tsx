'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import Logo from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import NavCommand from './nav-command'
import { getSidebarNavigationSections, type NavigationCommandItem } from './nav-command-helpers'

type MobileNavigationProps = {
  providerRunsEnabled?: boolean
}

function isItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function MobileNavigationItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationCommandItem
  pathname: string
  onNavigate: () => void
}) {
  const Icon = item.icon
  const active = isItemActive(pathname, item.href)

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="focus-visible:ring-sidebar-ring group relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-white/[0.045] hover:text-foreground focus-visible:ring-1 data-[active=true]:bg-white/[0.085] data-[active=true]:font-medium data-[active=true]:text-foreground"
      data-active={active}
      onClick={onNavigate}
    >
      <Icon
        className="text-muted-foreground/75 size-4 group-data-[active=true]:text-primary"
        strokeWidth={1.9}
        aria-hidden="true"
      />
      {item.label}
    </Link>
  )
}

export default function MobileNavigation({ providerRunsEnabled = false }: MobileNavigationProps) {
  const pathname = usePathname()
  const sections = getSidebarNavigationSections({ providerRunsEnabled })
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[rgba(14,27,46,0.86)] px-3 shadow-[inset_0_-1px_0_rgba(255,255,255,0.025)] backdrop-blur-md">
        <Link
          href="/"
          aria-label="AppraiseJS dashboard"
          className="focus-visible:ring-sidebar-ring rounded-md outline-none focus-visible:ring-1"
        >
          <Logo compact />
        </Link>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8 border-white/[0.1] bg-white/[0.04]"
            aria-label="Open navigation menu"
          >
            <Menu className="size-4" aria-hidden="true" />
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="left-0 top-0 h-dvh w-[min(20rem,calc(100vw-2.5rem))] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-l-0 border-r-white/[0.1] bg-[linear-gradient(180deg,rgba(38,83,121,0.42),rgba(18,37,64,0.36)_34%,rgba(13,20,34,0.58))] p-0 shadow-2xl sm:rounded-none">
        <DialogTitle className="sr-only">Navigation menu</DialogTitle>
        <DialogDescription className="sr-only">Navigate AppraiseJS or open the command palette.</DialogDescription>
        <div className="border-b border-white/[0.08] px-4 py-3 pr-12">
          <Logo compact />
        </div>
        <div className="px-3 py-2">
          <NavCommand
            variant="sidebar"
            label="Search"
            providerRunsEnabled={providerRunsEnabled}
            className="h-8 w-full border-white/[0.1] bg-white/[0.055] text-xs"
          />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Primary navigation">
          <div className="space-y-3.5">
            {sections.map(section => (
              <section key={section.label}>
                <h2 className="text-muted-foreground/70 mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                  {section.label}
                </h2>
                <div className="space-y-px">
                  {section.items.map(item => (
                    <MobileNavigationItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>
        <p className="text-muted-foreground/80 flex items-center gap-2 border-t border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[11px]">
          <span className="bg-primary/75 size-1.5 rounded-full" aria-hidden="true" />
          Local-first workspace
        </p>
      </DialogContent>
    </Dialog>
  )
}
