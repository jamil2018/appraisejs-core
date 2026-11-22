import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const toneClasses: Record<StatusTone, string> = {
  success: 'border-success-border bg-success-surface text-success',
  danger: 'border-danger-border bg-danger-surface text-danger',
  warning: 'border-warning-border bg-warning-surface text-warning',
  info: 'border-info-border bg-info-surface text-info',
  neutral: 'border-border bg-secondary text-secondary-foreground',
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
