'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Blocks, FileCheck, LayoutTemplate, ListChecks, Route, TestTubeDiagonal, TestTubes, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { presentationVocabulary } from '@/lib/presentation-vocabulary'

const quickActions = [
  {
    label: 'Start a Quality Journey',
    description: 'Plan and run tests from a requirement',
    href: '/quality-journeys/new',
    icon: Route,
  },
  {
    label: 'Create Suite',
    description: 'Bundle related tests together',
    href: '/test-suites/create',
    icon: TestTubes,
  },
  {
    label: 'Create Test',
    description: 'Define new scenarios & cases',
    href: '/test-cases/create',
    icon: TestTubeDiagonal,
  },
  {
    label: 'Create Step',
    description: 'Build a reusable Gherkin step',
    href: '/step-definitions/create',
    icon: LayoutTemplate,
  },
  {
    label: 'Create Run',
    description: 'Execute automated runs',
    href: '/test-runs/create',
    icon: ListChecks,
  },
  {
    label: presentationVocabulary.caseTemplate.create,
    description: 'Design dynamic step structures',
    href: '/template-test-cases/create',
    icon: Blocks,
  },
  {
    label: 'View Reports',
    description: 'Examine quality metrics & logs',
    href: '/reports',
    icon: FileCheck,
  },
]

export default function QuickActionsDrawer() {
  const { push } = useRouter()
  return (
    <Card id="container">
      <CardHeader id="header" className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">Quick Actions</CardTitle>
        <CardDescription className="text-xs leading-5 text-muted-foreground">
          Instantly create workspace assets or execute runs
        </CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative px-4 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map(({ label, description, href, icon: Icon }) => (
            <button
              key={href}
              type="button"
              onClick={() => push(href)}
              className="app-focus flex min-h-[84px] items-start gap-3 rounded-lg border bg-field p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Icon className="size-5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="line-clamp-2 block text-xs leading-4 text-muted-foreground">{description}</span>
              </div>
              <Plus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
