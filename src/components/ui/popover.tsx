'use client'

import * as React from 'react'
import { Popover as Primitive } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

const Popover = Primitive.Root
const PopoverTrigger = Primitive.Trigger

type PopoverContentProps = Omit<React.ComponentProps<typeof Primitive.Popup>, 'className'> & {
  className?: string
} & Pick<React.ComponentProps<typeof Primitive.Positioner>, 'align' | 'side' | 'sideOffset' | 'alignOffset'>
function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  alignOffset,
  ...props
}: PopoverContentProps) {
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
            'app-glass w-72 origin-[var(--transform-origin)] rounded-xl border p-4 text-popover-foreground outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </Primitive.Positioner>
    </Primitive.Portal>
  )
}
export { Popover, PopoverTrigger, PopoverContent }
