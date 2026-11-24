import type { ReactNode } from 'react'

import PageHeader from '@/components/typography/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyHeader } from '@/components/ui/empty'
import type { ActionResponse } from '@/types/form/actionHandler'

export function CollectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <PageHeader>{title}</PageHeader>
      {children}
    </header>
  )
}

export function CollectionEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Empty className="items-start rounded-xl border border-solid border-border bg-card p-4 text-left md:p-4">
      <EmptyHeader className="items-start text-left">
        <h2 className="text-sm font-medium">{title}</h2>
        {children}
      </EmptyHeader>
    </Empty>
  )
}

export function collectionLoadError({ error, message, success }: ActionResponse) {
  return error || (success === false ? (message ?? 'Try refreshing this page.') : undefined)
}

export function CollectionResults({
  emptyTitle,
  errorTitle,
  error,
  children,
}: {
  emptyTitle: string
  errorTitle: string
  error?: string
  children: ReactNode
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{errorTitle}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return children ?? <CollectionEmpty title={emptyTitle} />
}
