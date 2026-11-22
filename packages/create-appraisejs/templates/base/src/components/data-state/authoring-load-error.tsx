import Link from 'next/link'
import { ArrowLeft, CircleAlert } from 'lucide-react'

import PageHeader from '@/components/typography/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function AuthoringLoadError({
  title,
  listHref,
  listLabel,
  message,
}: {
  title: string
  listHref: string
  listLabel: string
  message: string
}) {
  return (
    <div>
      <div className="mb-8">
        <PageHeader>{title}</PageHeader>
      </div>
      <Alert>
        <CircleAlert className="size-4" aria-hidden="true" />
        <AlertTitle>Form unavailable</AlertTitle>
        <AlertDescription>
          <p>Appraise couldn’t load the test assets this form needs. No changes were made.</p>
          <details className="mt-3">
            <summary className="app-focus w-fit cursor-pointer text-muted-foreground">Error details</summary>
            <p className="mt-2 break-words text-muted-foreground">{message}</p>
          </details>
        </AlertDescription>
      </Alert>
      <Button className="mt-4" variant="outline" render={<Link href={listHref} />} nativeButton={false}>
        <ArrowLeft aria-hidden="true" />
        {listLabel}
      </Button>
    </div>
  )
}
