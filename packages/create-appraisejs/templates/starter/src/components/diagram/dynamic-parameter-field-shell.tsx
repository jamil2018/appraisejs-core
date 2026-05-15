'use client'

import ErrorMessage from '@/components/form/error-message'
import type { ReactNode } from 'react'

import { DynamicParameterFieldLabel } from './dynamic-parameter-field-label'

type DynamicParameterFieldShellProps = {
  name: string
  defaultValueInput: boolean
  htmlFor?: string
  errorMessage?: string
  children: ReactNode
}

export function DynamicParameterFieldShell({
  name,
  defaultValueInput,
  htmlFor,
  errorMessage,
  children,
}: DynamicParameterFieldShellProps) {
  return (
    <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
      <DynamicParameterFieldLabel name={name} defaultValueInput={defaultValueInput} htmlFor={htmlFor} />
      {children}
      <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
    </div>
  )
}
