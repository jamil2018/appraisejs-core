'use client'

import * as React from 'react'
import { Menu as Primitive } from '@base-ui/react/menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const DropdownMenu = Primitive.Root
const DropdownMenuTrigger = Primitive.Trigger
const DropdownMenuGroup = Primitive.Group

type DropdownMenuContentProps = Omit<React.ComponentProps<typeof Primitive.Popup>, 'className'> & {
  className?: string
} & Pick<React.ComponentProps<typeof Primitive.Positioner>, 'align' | 'side' | 'sideOffset' | 'alignOffset'>
function DropdownMenuContent({
  className,
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
  alignOffset,
  ...props
}: DropdownMenuContentProps) {
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
            'app-glass max-h-[var(--available-height)] min-w-32 origin-[var(--transform-origin)] overflow-y-auto overflow-x-hidden rounded-xl border p-1 text-popover-foreground outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </Primitive.Positioner>
    </Primitive.Portal>
  )
}
const itemClassName =
  'relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-2 py-1 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0'
type DropdownMenuItemProps = Omit<React.ComponentProps<typeof Primitive.Item>, 'className'> & {
  className?: string
  inset?: boolean
}
function DropdownMenuItem({ className, inset, ...props }: DropdownMenuItemProps) {
  return <Primitive.Item className={cn(itemClassName, inset && 'pl-8', className)} {...props} />
}
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.CheckboxItem>, 'className'> & { className?: string }) {
  return (
    <Primitive.CheckboxItem className={cn(itemClassName, 'pl-8', className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Primitive.CheckboxItemIndicator>
          <Check className="size-4" aria-hidden />
        </Primitive.CheckboxItemIndicator>
      </span>
      {children}
    </Primitive.CheckboxItem>
  )
}
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.GroupLabel>, 'className'> & { className?: string; inset?: boolean }) {
  return (
    <Primitive.GroupLabel
      className={cn('px-2 py-2 text-xs font-medium text-muted-foreground', inset && 'pl-8', className)}
      {...props}
    />
  )
}
function DropdownMenuSeparator({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.Separator>, 'className'> & { className?: string }) {
  return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
