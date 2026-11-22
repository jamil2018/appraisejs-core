'use client'

import { ArrowRight, BookOpenCheck, HelpCircle, TestTubeDiagonal, TestTubes, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface DataCardProps {
  title: string
  value: number
  link: string
}

const entityIcons: Record<string, LucideIcon> = {
  'Test Cases': TestTubeDiagonal,
  'Test Suites': TestTubes,
  'Step Definitions': BookOpenCheck,
}

export default function DataCard({ title, value, link }: DataCardProps) {
  const { push } = useRouter()
  const isEmpty = value === 0
  const Icon = entityIcons[title] ?? HelpCircle

  return (
    <button
      type="button"
      onClick={() => push(link)}
      disabled={isEmpty}
      className="app-focus flex min-h-[116px] w-full flex-col justify-between gap-4 rounded-lg border bg-field p-3 text-left transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed"
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {title}
        <Icon className="size-4 shrink-0" aria-hidden />
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {!isEmpty && <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
      </span>
    </button>
  )
}
