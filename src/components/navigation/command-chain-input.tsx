'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { CommandBadge } from './command-badge'
import { cn } from '@/lib/utils'

interface CommandChainInputProps extends React.ComponentProps<typeof CommandPrimitive.Input> {
  badge?: {
    label: string
    onClose: () => void
  }
}

export function CommandChainInput({ badge, className, onKeyDown, ...props }: CommandChainInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value && badge) {
      e.preventDefault()
      badge.onClose()
      return
    }
    onKeyDown?.(e)
  }

  return (
    <div className="flex items-center border-b px-3" data-cmdk-input-wrapper="">
      <Search className="mr-2 size-4 shrink-0 opacity-50" />
      {badge && (
        <div className="mr-2 flex-shrink-0">
          <CommandBadge label={badge.label} onClose={badge.onClose} />
        </div>
      )}
      <CommandPrimitive.Input
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onKeyDown={handleKeyDown}
        {...props}
      />
    </div>
  )
}

CommandChainInput.displayName = 'CommandChainInput'
