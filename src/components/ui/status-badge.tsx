import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const toneClasses: Record<StatusTone, string> = {
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  danger: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  neutral: 'border-slate-400/20 bg-slate-400/10 text-slate-200',
}

type StatusBadgeProps = {
  label: string
  tone?: StatusTone
  icon?: ReactNode
  className?: string
}

export function StatusBadge({ label, tone = 'neutral', icon, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-4 shadow-none',
        toneClasses[tone],
        className,
      )}
    >
      {icon ? (
        <span className="size-3.5 shrink-0 [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
    </Badge>
  )
}
