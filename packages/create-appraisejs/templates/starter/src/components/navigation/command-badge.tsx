'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'

export interface CommandBadgeProps {
  label: string
  onClose: () => void
  className?: string
}

export function CommandBadge({ label, onClose, className }: CommandBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn('inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium', className)}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onClose()
        }}
        className="hover:bg-secondary-foreground/20 ml-0.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`Clear ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}
