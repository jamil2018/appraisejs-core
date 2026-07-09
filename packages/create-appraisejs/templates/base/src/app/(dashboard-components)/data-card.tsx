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
    hoverClass: 'hover:border-primary/40 hover:bg-primary/[0.08]',
  },
  'Test Suites': {
    Icon: TestTubes,
    colorClass: 'text-sky-400',
    bgClass: 'border-sky-500/20 bg-sky-500/[0.04]',
    hoverClass: 'hover:border-sky-500/40 hover:bg-sky-500/[0.08]',
  },
  'Template Steps': {
    Icon: LayoutTemplate,
    colorClass: 'text-indigo-400',
    bgClass: 'border-indigo-500/20 bg-indigo-500/[0.04]',
    hoverClass: 'hover:border-indigo-500/40 hover:bg-indigo-500/[0.08]',
  },
}

const DEFAULT_THEME: EntityTheme = {
  Icon: HelpCircle,
  colorClass: 'text-zinc-400',
  bgClass: 'border-white/[0.08] bg-white/[0.04]',
  hoverClass: 'hover:border-white/[0.18] hover:bg-white/[0.08]',
}

function DataCardHeader({ title, theme, isEmpty }: { title: string; theme: EntityTheme; isEmpty: boolean }) {
  const { Icon } = theme

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <CardTitle
        className={cn(
          'text-xs font-semibold uppercase tracking-wide',
          isEmpty ? 'text-zinc-500' : 'text-zinc-300 group-hover:text-white'
        )}
      >
        {title}
      </CardTitle>
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-300',
          isEmpty ? 'border-white/[0.05] bg-white/[0.02] text-zinc-600' : `${theme.bgClass} ${theme.colorClass}`
        )}
      >
        <Icon className="size-5" />
      </div>
    </div>
  )
}

function DataCardValue({ value, theme, isEmpty }: { value: number; theme: EntityTheme; isEmpty: boolean }) {
  return (
    <div className="mt-5 flex w-full items-baseline justify-between">
      <span
        className={cn(
          'text-3xl font-extrabold tracking-tight transition-all duration-300',
          isEmpty ? 'text-zinc-600' : `${theme.colorClass} origin-left group-hover:scale-[1.02]`
        )}
      >
        {value}
      </span>
      {!isEmpty && (
        <div className="text-zinc-500 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-zinc-300">
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
        'group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border p-[18px] text-left transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-primary',
        isEmpty
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-50'
          : `cursor-pointer border-white/[0.07] bg-white/[0.03] hover:shadow-[0_4px_20px_rgba(0,0,0,0.18)] ${theme.hoverClass}`
      )}
    >
      <DataCardHeader title={title} theme={theme} isEmpty={isEmpty} />
      <DataCardValue value={value} theme={theme} isEmpty={isEmpty} />
    </button>
  )
}
