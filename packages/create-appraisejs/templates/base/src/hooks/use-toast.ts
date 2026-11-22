'use client'

import { toastManager, type ToastProps } from '@/components/ui/toast'

function toManagerOptions({ title, description, variant, duration, action, onOpenChange }: ToastProps) {
  return {
    title,
    description,
    type: variant,
    timeout: duration,
    priority: variant === 'destructive' ? ('high' as const) : ('low' as const),
    data: { variant, action },
    onClose: () => onOpenChange?.(false),
  }
}

function toast(props: ToastProps) {
  toastManager.close()
  const id = toastManager.add(toManagerOptions(props))
  return {
    id,
    dismiss: () => toastManager.close(id),
    update: (updates: Partial<ToastProps>) =>
      toastManager.update(id, previous => {
        const merged = {
          title: previous.title,
          description: previous.description,
          variant: previous.data?.variant,
          action: previous.data?.action,
          duration: previous.timeout,
          ...updates,
        }
        return toManagerOptions(merged)
      }),
  }
}

function useToast() {
  return { toast, dismiss: (id?: string) => toastManager.close(id) }
}

export { useToast, toast }
