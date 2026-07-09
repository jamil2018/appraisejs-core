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
    href: '/template-steps/create',
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
    <Card id="container" className="relative overflow-hidden border-white/[0.08] bg-gradient-to-b from-[rgba(24,45,75,0.35)] to-[rgba(12,20,35,0.45)] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-transparent pointer-events-none" />
      <CardHeader id="header" className="relative pb-5">
        <CardTitle className="text-lg font-bold text-white tracking-tight">Quick Actions</CardTitle>
        <CardDescription className="text-zinc-400 text-xs leading-relaxed">
          Instantly create workspace assets or execute runs
        </CardDescription>
      </CardHeader>
      <CardContent id="content" className="relative pt-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {quickActions.map(({ label, description, href, icon: Icon, theme }) => (
            <button
              key={href}
              onClick={() => push(href)}
              className={`group flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4.5 text-left transition-all duration-300 outline-none hover:border-white/[0.15] hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-primary ${theme.hoverGlow}`}
            >
              {/* Top row: Icon box & Mini action marker */}
              <div className="flex w-full items-center justify-between">
                <div
                  className={`flex size-9 items-center justify-center rounded-lg border transition-all duration-300 ${theme.border} ${theme.bg} ${theme.text} ${theme.hoverBorder} ${theme.hoverBg}`}
                >
                  <Icon className="size-5" />
                </div>
                <div className="flex size-5 items-center justify-center rounded-full bg-white/[0.03] border border-white/[0.06] text-zinc-500 opacity-60 transition-all duration-300 group-hover:scale-110 group-hover:opacity-100 group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:text-primary">
                  <Plus className="size-3" />
                </div>
              </div>

              {/* Bottom row: Text & Meta info */}
              <div className="mt-5 space-y-1">
                <span className="block text-sm font-semibold text-zinc-100 transition-colors duration-300 group-hover:text-white">
                  {label}
                </span>
                <span className="block text-[11px] leading-relaxed text-zinc-400/80 line-clamp-2 transition-colors duration-300 group-hover:text-zinc-300">
                  {description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
