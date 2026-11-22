import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function BaseNode({ className, selected, ...props }: HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn(
        'app-focus relative rounded-lg border border-border bg-card p-4 text-card-foreground',
        className,
        selected ? 'border-primary ring-1 ring-primary' : '',
        'hover:ring-1',
      )}
      tabIndex={0}
      {...props}
    />
  )
}
