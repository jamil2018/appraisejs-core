'use client'

import * as React from 'react'
import { type DialogProps } from '@radix-ui/react-dialog'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-md bg-[rgba(16,30,50,0.96)] text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
}

Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, shouldFilter, ...props }: DialogProps & { shouldFilter?: boolean }) => {
  return (
    <Dialog {...props}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden border border-white/[0.12] bg-[rgba(16,30,50,0.96)] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:w-full">
        <DialogDescription className="sr-only">
          Search for pages and records, then choose a result to navigate.
        </DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:text-muted-foreground/75 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:border-t [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:border-white/[0.06] [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2.5 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4 [&_[data-cmdk-input-wrapper]_svg]:h-4 [&_[data-cmdk-input-wrapper]_svg]:w-4"
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
    <div className="flex items-center border-b border-white/[0.08] px-3" data-cmdk-input-wrapper="">
      <Search className="mr-2 size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
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
        'relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm text-popover-foreground outline-none hover:bg-white/[0.055] data-[disabled=true]:pointer-events-none data-[selected=true]:bg-white/[0.085] data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  )
}

CommandItem.displayName = CommandPrimitive.Item.displayName

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem }
