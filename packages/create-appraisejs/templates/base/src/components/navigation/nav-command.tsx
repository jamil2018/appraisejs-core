'use client'

import { Command, Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'

import { Button } from '../ui/button'
import { CommandDialog, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../ui/command'
import { DialogDescription, DialogTitle } from '../ui/dialog'
import { CommandChainInput } from './command-chain-input'
import {
  commandModePlaceholders,
  defaultCommandPlaceholder,
  getCommandBadge,
  getNavigationCommandGroups,
  searchCommandItems,
} from './nav-command-helpers'
import { NavCommandSearch } from './nav-command-search'
import { useNavCommand } from './use-nav-command'

export type NavCommandProps = {
  className?: string
  label?: string
  providerRunsEnabled?: boolean
  variant?: 'default' | 'sidebar'
}

function CommandShortcut({ isMac }: { isMac: boolean }) {
  return (
    <span className="text-muted-foreground/80 inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] leading-none">
      {isMac ? (
        <>
          <Command className="size-2.5" aria-hidden="true" />
          <span>K</span>
        </>
      ) : (
        <span>Ctrl K</span>
      )}
    </span>
  )
}

export default function NavCommand({
  className,
  label = 'Open Command Palette',
  providerRunsEnabled = false,
  variant = 'default',
}: NavCommandProps) {
  const { push } = useRouter()
  const { open, setOpen, commandMode, searchQuery, setSearchQuery, isMac, clearSearchMode, selectSearchMode } =
    useNavCommand()
  const navigationCommandGroups = getNavigationCommandGroups({ providerRunsEnabled })

  const handleNavigate = (href: string) => {
    push(href)
    setOpen(false)
  }

  const isSidebar = variant === 'sidebar'

  return (
    <>
      <Button
        variant="outline"
        aria-label="Open Command Palette"
        className={cn(
          'hover:bg-accent-foreground/10 min-w-0 hover:text-primary',
          isSidebar ? 'flex items-center gap-2' : 'flex w-1/5 justify-between px-4',
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {isSidebar ? (
          <>
            <Search className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <CommandShortcut isMac={isMac} />
          </>
        ) : (
          <>
            <span>{label}</span>
            <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <kbd className="rounded-md bg-muted px-1 text-xs text-zinc-400">
                {isMac ? <Command className="size-2 text-zinc-400" /> : 'Ctrl'}
              </kbd>
              <Plus className="size-2 text-zinc-400" />
              <kbd className="rounded-md bg-muted px-1 text-xs text-zinc-400">K</kbd>
            </div>
          </>
        )}
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={!commandMode}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search for a command or navigate to a page</DialogDescription>
        <CommandChainInput
          placeholder={commandMode ? commandModePlaceholders[commandMode] : defaultCommandPlaceholder}
          badge={getCommandBadge(commandMode, clearSearchMode)}
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {commandMode ? (
            <NavCommandSearch commandMode={commandMode} searchQuery={searchQuery} onSelectRoute={handleNavigate} />
          ) : (
            <>
              {navigationCommandGroups.map(group => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.items.map(item => {
                    const Icon = item.icon
                    return (
                      <CommandItem key={item.href} value={item.label} onSelect={() => handleNavigate(item.href)}>
                        <Icon className="size-4" />
                        {item.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
              <CommandGroup heading="Search">
                {searchCommandItems.map(item => {
                  const Icon = item.icon
                  return (
                    <CommandItem key={item.mode} value={item.label} onSelect={() => selectSearchMode(item.mode)}>
                      <Icon className="size-4" />
                      {item.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
