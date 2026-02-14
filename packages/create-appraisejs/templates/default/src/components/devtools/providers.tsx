'use client'

import { TanStackDevtools } from '@tanstack/react-devtools'
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools'

export function DevtoolsProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
    </>
  )
}
