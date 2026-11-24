import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import {
  listReadyStepDefinitionOptionsAction,
  listStepDefinitionDraftsAction,
} from '@/actions/step-definition/step-definition-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
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
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        Unable to load Step Definitions: {response.error ?? draftResponse.error ?? 'Unknown registry error.'}
      </div>
    )
  }

  const definitions = (response.data ?? []) as StepDefinitionOption[]
  const drafts = (draftResponse.data ?? []) as StepDefinitionDraftSummary[]

  const empty = definitions.length === 0 && drafts.length === 0

  return (
    <div className="space-y-4">
      <CollectionHeader title="Step Definitions">
        <Button render={<Link href="/step-definitions/create" />} nativeButton={false} className="rounded-xl">
          <Plus aria-hidden="true" /> Create Step Definition
        </Button>
      </CollectionHeader>
      {empty ? (
        <CollectionEmpty title="No ready Step Definitions found" />
      ) : (
        <StepDefinitionRegistry definitions={definitions} drafts={drafts} />
      )}
    </div>
  )
}
