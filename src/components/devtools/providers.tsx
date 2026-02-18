'use client'

import { TanStackDevtools } from '@tanstack/react-devtools'
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools'

const devtoolsEnabled =
  process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS !== '1' &&
  process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS !== 'true'

export function DevtoolsProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {devtoolsEnabled && (
        <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
      )}
    </>
  )
}
