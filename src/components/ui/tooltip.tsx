'use client'

import * as React from 'react'
import { Tooltip as Primitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

const Tooltip = Primitive.Root
const TooltipTrigger = Primitive.Trigger
const TooltipProvider = Primitive.Provider

type TooltipContentProps = Omit<React.ComponentProps<typeof Primitive.Popup>, 'className'> & {
  className?: string
} & Pick<React.ComponentProps<typeof Primitive.Positioner>, 'align' | 'side' | 'sideOffset' | 'alignOffset'>
function TooltipContent({
  className,
  align = 'center',
  side = 'top',
  sideOffset = 4,
  alignOffset,
  ...props
}: TooltipContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner
        className="z-50"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <Primitive.Popup
          className={cn(
            'origin-[var(--transform-origin)] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </Primitive.Positioner>
    </Primitive.Portal>
  )
}
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
