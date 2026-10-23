import type { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import { stepPublicationReceiptSchema } from '../../../../../packages/cucumber-runtime/src/step-definitions/contracts'

type PublishedReader = Pick<StepDefinitionRegistryService, 'read'>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function parsePublishedReceiptParams(
  params: Record<string, string | string[] | undefined>,
): { id: string; version: string; definitionHash: string } | undefined {
  const id = first(params.id)
  const version = first(params.version)
  const definitionHash = first(params.definitionHash)
  if (!id || !version || !definitionHash) return
  return { id, version, definitionHash }
}

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
