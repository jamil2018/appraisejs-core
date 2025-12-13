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
  TestTube,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { CommandEmpty, CommandList, CommandGroup, CommandItem, CommandDialog } from '../ui/command'
import { DialogDescription, DialogTitle } from '../ui/dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CommandChainInput } from './command-chain-input'
import { EntitySearchCommand } from './entity-search-command'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuite, TestCase, TemplateStep, TestRun } from '@prisma/client'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { getAllTestRunsAction } from '@/actions/test-run/test-run-actions'

type CommandMode = null | 'search-test-suite' | 'search-test-case' | 'search-template-step' | 'search-test-run'

const commandModeToPlaceholder = {
  'search-test-suite': 'Search Test Suite by Name...',
  'search-test-case': 'Search Test Case by Title...',
  'search-template-step': 'Search Template Step by Name...',
  'search-test-run': 'Search Test Run by Name...',
}

export default function NavCommand({ className }: { className?: string }) {
  const platform = navigator.userAgent.toLowerCase().includes('mac') ? 'Mac' : 'Windows'
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [commandMode, setCommandMode] = useState<CommandMode>(null)
  const [searchQuery, setSearchQuery] = useState('')

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

  // Reset command mode and search query when dialog closes
  useEffect(() => {
    if (!open) {
      setCommandMode(null)
      setSearchQuery('')
    }
  }, [open])

  const handleTestSuiteSelect = (testSuite: TestSuite) => {
    router.push(`/test-suites/modify/${testSuite.id}`)
    setOpen(false)
  }
  const handleTestCaseSelect = (testCase: TestCase) => {
    router.push(`/test-cases/modify/${testCase.id}`)
    setOpen(false)
  }
  const handleTemplateStepSelect = (templateStep: TemplateStep) => {
    router.push(`/template-steps/modify/${templateStep.id}`)
    setOpen(false)
  }
  const handleTestRunSelect = (testRun: TestRun) => {
    router.push(`/test-runs/${testRun.id}`)
    setOpen(false)
  }

  const getBadgeConfig = () => {
    if (commandMode === 'search-test-suite') {
      return {
        label: 'Search Test Suite',
        onClose: () => {
          setCommandMode(null)
          setSearchQuery('')
        },
      }
    }
    if (commandMode === 'search-test-case') {
      return {
        label: 'Search Test Case',
        onClose: () => {
          setCommandMode(null)
          setSearchQuery('')
        },
      }
    }
    if (commandMode === 'search-template-step') {
      return {
        label: 'Search Template Step',
        onClose: () => {
          setCommandMode(null)
          setSearchQuery('')
        },
      }
    }
    if (commandMode === 'search-test-run') {
      return {
        label: 'Search Test Run',
        onClose: () => {
          setCommandMode(null)
          setSearchQuery('')
        },
      }
    }
    return undefined
  }

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
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={!commandMode}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search for a command or navigate to a page</DialogDescription>
        <CommandChainInput
          placeholder={commandMode ? commandModeToPlaceholder[commandMode] : 'Type a command or search...'}
          badge={getBadgeConfig()}
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {commandMode === 'search-test-suite' ? (
            <EntitySearchCommand
              searchQuery={searchQuery}
              entityName="Test Suite"
              fetchAction={getAllTestSuitesAction}
              searchKey="name"
              getNavigationPath={testSuite => `/test-suites/modify/${testSuite.id}`}
              icon={<TestTubes className="h-4 w-4" />}
              onSelect={handleTestSuiteSelect}
            />
          ) : commandMode === 'search-test-case' ? (
            <EntitySearchCommand
              searchQuery={searchQuery}
              entityName="Test Case"
              fetchAction={getAllTestCasesAction}
              searchKey="title"
              getNavigationPath={testCase => `/test-cases/modify/${testCase.id}`}
              icon={<TestTubeDiagonal className="h-4 w-4" />}
              onSelect={handleTestCaseSelect}
            />
          ) : commandMode === 'search-template-step' ? (
            <EntitySearchCommand
              searchQuery={searchQuery}
              entityName="Template Step"
              fetchAction={getAllTemplateStepsAction}
              searchKey="name"
              getNavigationPath={templateStep => `/template-steps/modify/${templateStep.id}`}
              icon={<LayoutTemplate className="h-4 w-4" />}
              onSelect={handleTemplateStepSelect}
            />
          ) : commandMode === 'search-test-run' ? (
            <EntitySearchCommand
              searchQuery={searchQuery}
              entityName="Test Run"
              fetchAction={getAllTestRunsAction}
              searchKey="name"
              getNavigationPath={testRun => `/test-runs/${testRun.id}`}
              icon={<ListChecks className="h-4 w-4" />}
              onSelect={handleTestRunSelect}
            />
          ) : (
            <>
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
                <CommandItem
                  asChild
                  onSelect={() => {
                    setOpen(false)
                    router.push('/test-runs/create')
                  }}
                >
                  <Link href="/test-runs/create" onClick={() => setOpen(false)}>
                    <ListChecks className="h-4 w-4" />
                    Create Test Run
                  </Link>
                </CommandItem>
                <CommandItem
                  asChild
                  onSelect={() => {
                    setOpen(false)
                    router.push('/test-suites/create')
                  }}
                >
                  <Link href="/test-suites/create" onClick={() => setOpen(false)}>
                    <TestTubes className="h-4 w-4" />
                    Create Test Suite
                  </Link>
                </CommandItem>
                <CommandItem
                  asChild
                  onSelect={() => {
                    setOpen(false)
                    router.push('/test-cases/create')
                  }}
                >
                  <Link href="/test-cases/create" onClick={() => setOpen(false)}>
                    <TestTubeDiagonal className="h-4 w-4" />
                    Create Test Case
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
                <CommandItem
                  asChild
                  onSelect={() => {
                    setOpen(false)
                    router.push('/template-steps/create')
                  }}
                >
                  <Link href="/template-steps/create" onClick={() => setOpen(false)}>
                    <LayoutTemplate className="h-4 w-4" />
                    Create Template Step
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
              <CommandGroup heading="Search">
                <CommandItem
                  onSelect={() => {
                    setCommandMode('search-test-case')
                    setSearchQuery('')
                  }}
                >
                  <TestTubeDiagonal className="h-4 w-4" />
                  Search Test Cases
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setCommandMode('search-test-suite')
                    setSearchQuery('')
                  }}
                >
                  <TestTubes className="h-4 w-4" />
                  Search Test Suites
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setCommandMode('search-template-step')
                    setSearchQuery('')
                  }}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Search Template Steps
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setCommandMode('search-test-run')
                    setSearchQuery('')
                  }}
                >
                  <ListChecks className="h-4 w-4" />
                  Search Test Runs
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
