import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpenCheck, Plus } from 'lucide-react'

import {
  listReadyStepDefinitionOptionsAction,
  listStepDefinitionDraftsAction,
} from '@/actions/step-definition/step-definition-actions'
import EmptyState from '@/components/data-state/empty-state'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Button } from '@/components/ui/button'
import type { StepDefinitionDraftSummary, StepDefinitionOption } from '@/types/step-definition-option'

import { StepDefinitionRegistry } from './step-definition-registry'

export const metadata: Metadata = {
  title: 'Appraise | Step Definitions',
  description: 'Browse ready reusable Step Definitions and their exact invocation contracts.',
}

export default async function StepDefinitionsPage() {
  const [response, draftResponse] = await Promise.all([
    listReadyStepDefinitionOptionsAction(),
    listStepDefinitionDraftsAction(),
  ])

  if (response.status !== 200 || draftResponse.status !== 200) {
    return (
      <div role="alert" className="border-destructive/30 bg-destructive/10 rounded-md border p-4 text-sm">
        Unable to load Step Definitions: {response.error ?? draftResponse.error ?? 'Unknown registry error.'}
      </div>
    )
  }

  const definitions = (response.data ?? []) as StepDefinitionOption[]
  const drafts = (draftResponse.data ?? []) as StepDefinitionDraftSummary[]
  if (definitions.length === 0 && drafts.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<BookOpenCheck className="size-8" />}
          title="No ready Step Definitions found"
          description="Create and publish a reusable Step Definition to make it available for authored tests."
          createRoute="/step-definitions/create"
          createText="Create Step Definition"
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PageHeader>
            <span className="flex items-center gap-2">
              <BookOpenCheck aria-hidden="true" className="size-8" />
              Step Definitions
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Browse the ready, versioned contracts used by human-authored tests and managed validation.
          </HeaderSubtitle>
        </div>
        <Button asChild>
          <Link href="/step-definitions/create">
            <Plus aria-hidden="true" className="size-4" />
            Create Step Definition
          </Link>
        </Button>
      </div>
      <StepDefinitionRegistry definitions={definitions} drafts={drafts} />
    </div>
  )
}
