'use client'

import {
  Blocks,
  Code,
  Command,
  Component,
  FileCheck,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Plus,
  Puzzle,
  Server,
  Settings,
  Tag,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { CommandEmpty, CommandList, CommandGroup, CommandItem, CommandDialog, CommandInput } from '../ui/command'
import { DialogDescription, DialogTitle } from '../ui/dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NavCommand({ className }: { className?: string }) {
  const platform = navigator.userAgent.toLowerCase().includes('mac') ? 'Mac' : 'Windows'
  const router = useRouter()

  const [open, setOpen] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(open => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        className={cn('hover:bg-accent-foreground/10 flex w-1/5 justify-between px-4 hover:text-primary', className)}
        onClick={() => setOpen(true)}
      >
        <span>Open Command Palette</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <kbd className="rounded-md bg-muted px-1 text-xs text-gray-400">
            {platform === 'Mac' ? <Command className="h-2 w-2 text-gray-400" /> : 'Ctrl'}
          </kbd>
          <Plus className="h-2 w-2 text-gray-400" />
          <kbd className="rounded-md bg-muted px-1 text-xs text-gray-400">K</kbd>
        </div>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search for a command or navigate to a page</DialogDescription>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Overview">
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/')
              }}
            >
              <Link href="/" onClick={() => setOpen(false)}>
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Automate">
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/test-suites')
              }}
            >
              <Link href="/test-suites" onClick={() => setOpen(false)}>
                <TestTubes className="h-4 w-4" />
                Test Suites
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/test-cases')
              }}
            >
              <Link href="/test-cases" onClick={() => setOpen(false)}>
                <TestTubeDiagonal className="h-4 w-4" />
                Test Cases
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/test-runs')
              }}
            >
              <Link href="/test-runs" onClick={() => setOpen(false)}>
                <ListChecks className="h-4 w-4" />
                Test Runs
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/reports')
              }}
            >
              <Link href="/reports" onClick={() => setOpen(false)}>
                <FileCheck className="h-4 w-4" />
                Reports
              </Link>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Template">
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/template-steps')
              }}
            >
              <Link href="/template-steps" onClick={() => setOpen(false)}>
                <LayoutTemplate className="h-4 w-4" />
                Template Steps
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/template-step-groups')
              }}
            >
              <Link href="/template-step-groups" onClick={() => setOpen(false)}>
                <Component className="h-4 w-4" />
                Template Step Groups
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/template-test-cases')
              }}
            >
              <Link href="/template-test-cases" onClick={() => setOpen(false)}>
                <Blocks className="h-4 w-4" />
                Template Test Cases
              </Link>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Configuration">
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/locators')
              }}
            >
              <Link href="/locators" onClick={() => setOpen(false)}>
                <Code className="h-4 w-4" />
                Locators
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/locator-groups')
              }}
            >
              <Link href="/locator-groups" onClick={() => setOpen(false)}>
                <Group className="h-4 w-4" />
                Locator Groups
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/modules')
              }}
            >
              <Link href="/modules" onClick={() => setOpen(false)}>
                <Puzzle className="h-4 w-4" />
                Modules
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/environments')
              }}
            >
              <Link href="/environments" onClick={() => setOpen(false)}>
                <Server className="h-4 w-4" />
                Environments
              </Link>
            </CommandItem>
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/tags')
              }}
            >
              <Link href="/tags" onClick={() => setOpen(false)}>
                <Tag className="h-4 w-4" />
                Tags
              </Link>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Customization">
            <CommandItem
              asChild
              onSelect={() => {
                setOpen(false)
                router.push('/settings')
              }}
            >
              <Link href="/settings" onClick={() => setOpen(false)}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
