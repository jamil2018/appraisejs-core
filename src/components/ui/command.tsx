'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-lg bg-transparent text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
}

Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({
  children,
  shouldFilter,
  finalFocus,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Root>, 'children'> & {
  children?: React.ReactNode
  shouldFilter?: boolean
  finalFocus?: React.ComponentProps<typeof DialogContent>['finalFocus']
}) => {
  return (
    <Dialog {...props}>
      <DialogContent
        finalFocus={finalFocus}
        className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden border p-0 sm:w-full"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search for pages and records, then choose a result to navigate.
        </DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:border-t [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:border-border [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2.5 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4 [&_[data-cmdk-input-wrapper]_svg]:h-4 [&_[data-cmdk-input-wrapper]_svg]:w-4"
          shouldFilter={shouldFilter}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center border-b border-border px-3" data-cmdk-input-wrapper="">
      <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        className={cn(
          'flex h-10 w-full rounded-lg bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  )
}

CommandInput.displayName = CommandPrimitive.Input.displayName

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-[min(24rem,calc(100dvh-11rem))] overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  )
}

CommandList.displayName = CommandPrimitive.List.displayName

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm" {...props} />
}

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

CommandGroup.displayName = CommandPrimitive.Group.displayName

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-popover-foreground outline-none hover:bg-accent data-[disabled=true]:pointer-events-none data-[selected=true]:bg-selection-surface data-[selected=true]:text-selection data-[disabled=true]:opacity-50 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-selection-border forced-colors:data-[selected=true]:outline forced-colors:data-[selected=true]:outline-1 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  )
}

CommandItem.displayName = CommandPrimitive.Item.displayName

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem }
