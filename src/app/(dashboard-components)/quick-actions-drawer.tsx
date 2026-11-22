'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-foreground">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          {quickActions.map(({ label, description, href, icon: Icon }) => (
            <button
              key={href}
              type="button"
              onClick={() => push(href)}
              className="app-focus flex min-h-14 items-start gap-2.5 rounded-lg border bg-field p-2.5 text-left transition-colors hover:bg-accent"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Icon aria-hidden className="size-5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="line-clamp-2 block text-xs leading-4 text-muted-foreground">{description}</span>
              </div>
              <Plus aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
