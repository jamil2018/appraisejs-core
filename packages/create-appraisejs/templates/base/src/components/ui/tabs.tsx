'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type TabsProps = Omit<React.ComponentProps<typeof TabsPrimitive.Root>, 'onValueChange'> & {
  onValueChange?: (value: string) => void
}
function Tabs({ onValueChange, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      onValueChange={value => {
        if (typeof value === 'string') onValueChange?.(value)
      }}
      {...props}
    />
  )
}
function TabsList({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.List>, 'className'> & { className?: string }) {
  return (
    <TabsPrimitive.List
      activateOnFocus
      className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground', className)}
      {...props}
    />
  )
}
const tabsTriggerVariants = cva(
  'app-focus inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-transparent transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[active]:border-selection-border data-[active]:bg-selection-surface data-[active]:text-selection',
  {
    variants: { size: { default: 'h-8 px-3 text-sm font-medium', compact: 'h-8 px-3 text-xs font-medium' } },
    defaultVariants: { size: 'default' },
  },
)
function TabsTrigger({
  className,
  size,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Tab>, 'className'> &
  VariantProps<typeof tabsTriggerVariants> & { className?: string }) {
  return <TabsPrimitive.Tab className={cn(tabsTriggerVariants({ size }), className)} {...props} />
}
function TabsContent({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Panel>, 'className'> & { className?: string }) {
  return <TabsPrimitive.Panel className={cn('app-focus mt-2', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsTriggerVariants }
