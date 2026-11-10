import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import prisma from '@/config/db-config'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import { PublishedStepSuccess } from '../step-definition-draft-phases'
import { parsePublishedReceiptParams, resolvePublishedReceipt } from './published-receipt-helpers'

export const metadata: Metadata = {
  title: 'Step Definition published',
}

type PublishedReceiptPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PublishedReceiptPage({ searchParams }: PublishedReceiptPageProps) {
  const params = parsePublishedReceiptParams(await searchParams)
  if (!params) notFound()
  const { id, version, definitionHash } = params

  const published = await (async () => {
    try {
      return await resolvePublishedReceipt(new StepDefinitionRegistryService(prisma), id, version, definitionHash)
    } catch {
      return null
    }
  })()
  if (!published) notFound()
  return <PublishedStepSuccess published={published} />
}
