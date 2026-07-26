import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import prisma from '@/config/db-config'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import { stepPublicationReceiptSchema } from '../../../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { PublishedStepSuccess } from '../step-definition-draft-phases'

export const metadata: Metadata = {
  title: 'Step Definition published',
}

type PublishedReceiptPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

type PublishedReader = Pick<StepDefinitionRegistryService, 'read'>

export async function resolvePublishedReceipt(
  reader: PublishedReader,
  id: string,
  version: string,
  definitionHash: string,
) {
  const persisted = await reader.read(id, version)
  if (!persisted.publicationReceipt) return null
  const receipt = stepPublicationReceiptSchema.parse(JSON.parse(persisted.publicationReceipt.receiptJson))
  if (receipt.definitionHash !== definitionHash) return null
  return {
    id: receipt.step.id,
    version: receipt.step.version,
    signature: persisted.definition.human.signature,
  }
}

export default async function PublishedReceiptPage({ searchParams }: PublishedReceiptPageProps) {
  const params = await searchParams
  const id = first(params.id)
  const version = first(params.version)
  const definitionHash = first(params.definitionHash)
  if (!id || !version || !definitionHash) notFound()

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
