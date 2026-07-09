'use client'

import { CardTitle } from '@/components/ui/card'
import { ArrowRight, TestTubeDiagonal, TestTubes, LayoutTemplate, HelpCircle, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface DataCardProps {
  title: string
  value: number
  link: string
}

type EntityTheme = {
  Icon: LucideIcon
  colorClass: string
  bgClass: string
  hoverClass: string
}

const ENTITY_THEMES: Record<string, EntityTheme> = {
  'Test Cases': {
    Icon: TestTubeDiagonal,
    colorClass: 'text-primary',
    bgClass: 'border-primary/20 bg-primary/[0.04]',
    hoverClass: 'hover:border-white/[0.15] hover:bg-white/[0.04]',
  },
  'Test Suites': {
    Icon: TestTubes,
    colorClass: 'text-sky-400',
    bgClass: 'border-sky-500/20 bg-sky-500/[0.04]',
    hoverClass: 'hover:border-white/[0.15] hover:bg-white/[0.04]',
  },
  'Template Steps': {
    Icon: LayoutTemplate,
    colorClass: 'text-indigo-400',
    bgClass: 'border-indigo-500/20 bg-indigo-500/[0.04]',
    hoverClass: 'hover:border-white/[0.15] hover:bg-white/[0.04]',
  },
}

const DEFAULT_THEME: EntityTheme = {
  Icon: HelpCircle,
  colorClass: 'text-zinc-400',
  bgClass: 'border-white/[0.08] bg-white/[0.04]',
  hoverClass: 'hover:border-white/[0.15] hover:bg-white/[0.04]',
}

function DataCardHeader({ title, theme, isEmpty }: { title: string; theme: EntityTheme; isEmpty: boolean }) {
  const { Icon } = theme

  return (
    <div className="flex w-full items-start justify-between gap-3">
      <CardTitle
        className={cn(
          'pt-0.5 text-xs font-semibold uppercase leading-4 tracking-wide',
          isEmpty ? 'text-zinc-500' : 'text-zinc-300 group-hover:text-white',
        )}
      >
        {title}
      </CardTitle>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-200',
          isEmpty ? 'border-white/[0.05] bg-white/[0.02] text-zinc-600' : `${theme.bgClass} ${theme.colorClass}`,
        )}
      >
        <Icon className="size-4" />
      </div>
    </div>
  )
}

function DataCardValue({ value, theme, isEmpty }: { value: number; theme: EntityTheme; isEmpty: boolean }) {
  return (
    <div className="mt-4 flex w-full items-baseline justify-between">
      <span
        className={cn(
          'text-2xl font-bold leading-7 transition-colors duration-200',
          isEmpty ? 'text-zinc-600' : theme.colorClass,
        )}
      >
        {value}
      </span>
      {!isEmpty && (
        <div className="text-zinc-500 transition-colors duration-200 group-hover:text-zinc-300">
          <ArrowRight className="size-4" />
        </div>
      )}
    </div>
  )
}

export default function DataCard({ title, value, link }: DataCardProps) {
  const { push } = useRouter()
  const isEmpty = value === 0
  const theme = ENTITY_THEMES[title] ?? DEFAULT_THEME

  return (
    <button
      onClick={() => !isEmpty && push(link)}
      disabled={isEmpty}
      className={cn(
        'group relative flex min-h-[116px] w-full flex-col justify-between overflow-hidden rounded-lg border p-3 text-left outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-primary',
        isEmpty
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-50'
          : `cursor-pointer border-white/[0.07] bg-white/[0.03] ${theme.hoverClass}`,
      )}
    >
      <DataCardHeader title={title} theme={theme} isEmpty={isEmpty} />
      <DataCardValue value={value} theme={theme} isEmpty={isEmpty} />
    </button>
  )
}
