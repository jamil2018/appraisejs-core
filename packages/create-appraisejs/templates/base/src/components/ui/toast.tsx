'use client'

import * as React from 'react'
import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: 'default' | 'destructive'
  duration?: number
  action?: React.ReactElement
  onOpenChange?: (open: boolean) => void
}

type ToastData = Pick<ToastProps, 'variant' | 'action'>

const toastManager = ToastPrimitive.createToastManager<ToastData>()
const ToastProvider = ToastPrimitive.Provider

function ToastViewport({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 outline-none sm:max-w-[420px]',
        className,
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn(
        'app-glass group pointer-events-auto relative flex w-full items-center justify-between gap-3 rounded-xl border p-4 pr-8 text-popover-foreground transition-opacity data-[limited]:hidden data-[type=destructive]:border-danger-border data-[type=destructive]:bg-danger-surface data-[type=destructive]:text-danger data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function ToastClose({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      aria-label="Dismiss notification"
      className={cn(
        'app-focus absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
      {...props}
    >
      <X className="size-4" />
    </ToastPrimitive.Close>
  )
}

function ToastTitle({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title className={cn('text-sm font-semibold', className)} {...props} />
}

function ToastDescription({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return <ToastPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export {
  type ToastProps,
  type ToastData,
  toastManager,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
}
