'use client'

import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toastManager,
  type ToastData,
} from '@/components/ui/toast'

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>()
  return (
    <ToastViewport>
      {toasts.map(notification => (
        <Toast key={notification.id} toast={notification}>
          <ToastPrimitive.Content className="grid min-w-0 gap-1">
            {notification.title && <ToastTitle>{notification.title}</ToastTitle>}
            {notification.description && <ToastDescription>{notification.description}</ToastDescription>}
          </ToastPrimitive.Content>
          {notification.data?.action}
          <ToastClose />
        </Toast>
      ))}
    </ToastViewport>
  )
}

export function Toaster() {
  return (
    <ToastProvider toastManager={toastManager} limit={1}>
      <ToastList />
    </ToastProvider>
  )
}
