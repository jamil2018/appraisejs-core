import { describe, expect, it, vi } from 'vitest'

import { stepPublicationReceiptSchema } from '../../../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { resolvePublishedReceipt } from './page'

const definitionHash = `sha256:${'a'.repeat(64)}`
const receipt = stepPublicationReceiptSchema.parse({
  step: { id: 'custom.greeting', version: '1' },
  definitionHash,
  humanProjectionHash: `sha256:${'b'.repeat(64)}`,
  agentContractHash: `sha256:${'c'.repeat(64)}`,
  executionHash: `sha256:${'d'.repeat(64)}`,
  registryManifestHash: `sha256:${'e'.repeat(64)}`,
  executableReadiness: {
    projectionHash: `sha256:${'f'.repeat(64)}`,
    runtimeAdapterHash: `sha256:${'1'.repeat(64)}`,
    closureHash: `sha256:${'2'.repeat(64)}`,
  },
  conformanceRunId: 'run-1',
  reviewAuthority: 'local-human-ui',
  publishedAt: '2026-07-26T00:00:00.000Z',
})
const reader = {
  read: vi.fn().mockResolvedValue({
    publicationReceipt: { receiptJson: JSON.stringify(receipt) },
    definition: { human: { signature: 'I greet {recipientName}' } },
  }),
}

describe('resolvePublishedReceipt', () => {
  it('renders only an authoritative persisted publication receipt', async () => {
    await expect(resolvePublishedReceipt(reader as never, 'custom.greeting', '1', definitionHash)).resolves.toEqual({
      id: 'custom.greeting',
      version: '1',
      signature: 'I greet {recipientName}',
    })
  })

  it('rejects a tampered receipt URL', async () => {
    await expect(
      resolvePublishedReceipt(reader as never, 'custom.greeting', '1', `sha256:${'9'.repeat(64)}`),
    ).resolves.toBeNull()
  })
})
