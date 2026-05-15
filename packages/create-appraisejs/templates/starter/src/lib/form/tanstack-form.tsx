'use client'

import type { FormHTMLAttributes, ReactNode } from 'react'

import { getTanStackFormAction } from './tanstack-form-action'

type TanStackFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'> & {
  onSubmit: () => unknown | Promise<unknown>
  children: ReactNode
}

export function TanStackForm({ onSubmit, children, ...props }: TanStackFormProps) {
  return (
    <form action={getTanStackFormAction(onSubmit)} {...props}>
      {children}
    </form>
  )
}
