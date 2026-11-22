'use client'

import * as React from 'react'
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetClose = SheetPrimitive.Close
const SheetTrigger = SheetPrimitive.Trigger
const sides = {
  top: 'inset-x-0 top-0 border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full',
  bottom: 'inset-x-0 bottom-0 border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
  right:
    'inset-y-0 right-0 size-full border-l sm:max-w-xl data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
}
type SheetContentProps = Omit<React.ComponentProps<typeof SheetPrimitive.Popup>, 'className'> & {
  className?: string
  side?: keyof typeof sides
}
function SheetContent({ side = 'right', className, children, initialFocus = true, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <SheetPrimitive.Popup
        initialFocus={initialFocus}
        className={cn(
          'app-glass fixed z-50 flex flex-col gap-4 p-6 text-foreground outline-none transition-transform duration-200',
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="app-focus absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}
function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2 text-left', className)} {...props} />
}
function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}
function SheetTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Title>, 'className'> & { className?: string }) {
  return <SheetPrimitive.Title className={cn('text-lg font-semibold text-foreground', className)} {...props} />
}
function SheetDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof SheetPrimitive.Description>, 'className'> & { className?: string }) {
  return <SheetPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
