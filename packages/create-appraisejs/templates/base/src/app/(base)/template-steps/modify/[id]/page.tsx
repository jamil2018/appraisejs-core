import Link from 'next/link'
import type { Metadata } from 'next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Appraise | Legacy Template Step',
  description: 'Read-only legacy Template Step projection',
}

export default async function ModifyTemplateStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Card className="mx-auto max-w-2xl bg-zinc-500/10">
      <CardHeader>
        <CardTitle>Legacy Template Step is read-only</CardTitle>
        <CardDescription>
          Template Step {id} remains available for compatibility and historical resolution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          New and revised reusable behavior is authored as an immutable, versioned Step Definition.
        </p>
        <Button asChild>
          <Link href="/template-steps/create">Create a Step Definition draft</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
