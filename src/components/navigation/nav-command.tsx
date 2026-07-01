'use client'

import { Command, Plus } from 'lucide-react'
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
  providerRunsEnabled?: boolean
}

export default function NavCommand({ className, providerRunsEnabled = false }: NavCommandProps) {
  const { push } = useRouter()
  const { open, setOpen, commandMode, searchQuery, setSearchQuery, isMac, clearSearchMode, selectSearchMode } =
    useNavCommand()
  const navigationCommandGroups = getNavigationCommandGroups({ providerRunsEnabled })

  const handleNavigate = (href: string) => {
    push(href)
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="outline"
        aria-label="Open Command Palette"
        className={cn('hover:bg-accent-foreground/10 flex w-1/5 justify-between px-4 hover:text-primary', className)}
        onClick={() => setOpen(true)}
      >
        <span>Open Command Palette</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <kbd className="rounded-md bg-muted px-1 text-xs text-zinc-400">
            {isMac ? <Command className="size-2 text-zinc-400" /> : 'Ctrl'}
          </kbd>
          <Plus className="size-2 text-zinc-400" />
          <kbd className="rounded-md bg-muted px-1 text-xs text-zinc-400">K</kbd>
        </div>
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
