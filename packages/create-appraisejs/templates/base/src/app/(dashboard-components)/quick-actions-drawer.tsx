'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Blocks, FileCheck, LayoutTemplate, ListChecks, TestTubeDiagonal, TestTubes, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

const quickActions = [
  {
    label: 'Create Suite',
    description: 'Bundle related tests together',
    href: '/test-suites/create',
    icon: TestTubes,
    theme: {
      text: 'text-teal-400',
      bg: 'bg-teal-500/[0.04]',
      border: 'border-teal-500/20',
      hoverBorder: 'group-hover:border-teal-500/40',
      hoverBg: 'group-hover:bg-teal-500/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(20,184,166,0.06)]',
    },
  },
  {
    label: 'Create Test',
    description: 'Define new scenarios & cases',
    href: '/test-cases/create',
    icon: TestTubeDiagonal,
    theme: {
      text: 'text-primary',
      bg: 'bg-primary/[0.04]',
      border: 'border-primary/20',
      hoverBorder: 'group-hover:border-primary/40',
      hoverBg: 'group-hover:bg-primary/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(20,184,166,0.06)]',
    },
  },
  {
    label: 'Create Step',
    description: 'Build a reusable Gherkin step',
    href: '/step-definitions/create',
    icon: LayoutTemplate,
    theme: {
      text: 'text-indigo-400',
      bg: 'bg-indigo-500/[0.04]',
      border: 'border-indigo-500/20',
      hoverBorder: 'group-hover:border-indigo-500/40',
      hoverBg: 'group-hover:bg-indigo-500/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(99,102,241,0.06)]',
    },
  },
  {
    label: 'Create Run',
    description: 'Execute automated runs',
    href: '/test-runs/create',
    icon: ListChecks,
    theme: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/[0.04]',
      border: 'border-emerald-500/20',
      hoverBorder: 'group-hover:border-emerald-500/40',
      hoverBg: 'group-hover:bg-emerald-500/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]',
    },
  },
  {
    label: 'Create Template',
    description: 'Design dynamic step structures',
    href: '/template-test-cases/create',
    icon: Blocks,
    theme: {
      text: 'text-amber-400',
      bg: 'bg-amber-500/[0.04]',
      border: 'border-amber-500/20',
      hoverBorder: 'group-hover:border-amber-500/40',
      hoverBg: 'group-hover:bg-amber-500/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(245,158,11,0.06)]',
    },
  },
  {
    label: 'View Reports',
    description: 'Examine quality metrics & logs',
    href: '/reports',
    icon: FileCheck,
    theme: {
      text: 'text-violet-400',
      bg: 'bg-violet-500/[0.04]',
      border: 'border-violet-500/20',
      hoverBorder: 'group-hover:border-violet-500/40',
      hoverBg: 'group-hover:bg-violet-500/[0.08]',
      hoverGlow: 'group-hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]',
    },
  },
]

export default function QuickActionsDrawer() {
  const { push } = useRouter()
  return (
    <Card id="container" className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardHeader id="header" className="relative px-4 pb-3 pt-4">
        <CardTitle className="text-base font-semibold text-white">Quick Actions</CardTitle>
        <CardDescription className="text-xs leading-5 text-zinc-400">
          Instantly create workspace assets or execute runs
        </CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative px-4 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map(({ label, description, href, icon: Icon, theme }) => (
            <button
              key={href}
              onClick={() => push(href)}
              className="group flex min-h-[84px] items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left outline-none transition-colors duration-200 hover:border-white/[0.15] hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-primary"
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${theme.border} ${theme.bg} ${theme.text} ${theme.hoverBorder} ${theme.hoverBg}`}
              >
                <Icon className="size-5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold text-zinc-100 transition-colors duration-300 group-hover:text-white">
                  {label}
                </span>
                <span className="line-clamp-2 block text-xs leading-4 text-zinc-400/80 transition-colors duration-200 group-hover:text-zinc-300">
                  {description}
                </span>
              </div>
              <Plus className="mt-0.5 size-4 shrink-0 text-zinc-500 transition-colors duration-200 group-hover:text-primary" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
