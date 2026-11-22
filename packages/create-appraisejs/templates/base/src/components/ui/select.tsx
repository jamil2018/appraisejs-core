'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type SelectProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> & {
  onValueChange?: (value: string) => void
}
function Select({ onValueChange, value, defaultValue, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value === '' ? null : value}
      defaultValue={defaultValue === '' ? null : defaultValue}
      onValueChange={value => {
        if (value !== null) onValueChange?.(value)
      }}
      {...props}
    />
  )
}
const SelectValue = SelectPrimitive.Value
const SelectGroup = SelectPrimitive.Group
function SelectTrigger({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Trigger>, 'className'> & { className?: string }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'app-field app-focus group flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[popup-open]:rotate-180 motion-reduce:transition-none" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}
type SelectContentProps = Omit<React.ComponentProps<typeof SelectPrimitive.Popup>, 'className'> &
  Pick<React.ComponentProps<typeof SelectPrimitive.Positioner>, 'side' | 'align' | 'sideOffset'> & {
    className?: string
    emptyMessage?: string
    isEmpty?: boolean
  }
function SelectContent({
  className,
  children,
  emptyMessage = 'No item(s) available',
  isEmpty = false,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          className={cn(
            'app-glass max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border text-popover-foreground outline-none',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="flex justify-center py-1">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="max-h-[var(--available-height)] overflow-y-auto p-1">
            {isEmpty ? <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div> : children}
          </SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="flex justify-center py-1">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}
function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Item>, 'className'> & { className?: string }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex min-h-8 w-full cursor-default select-none items-center rounded-lg py-1 pl-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center justify-center">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectValue, SelectGroup, SelectTrigger, SelectContent, SelectItem }
