import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { expect, test } from 'vitest'

import {
  buildAppraiseMetadata,
  getAppraiseMetadataPath,
  readAppraiseMetadataFile,
} from '@/lib/appraise-test-case-metadata'

test('serializes title, stable nodes, and flow blocks by identifier tag', () => {
  const metadata = buildAppraiseMetadata({
    testSuiteName: 'Checkout suite',
    modulePath: '/commerce/checkout',
    testCases: [
      {
        title: 'Buys item',
        description: 'Happy path',
        tags: [{ tagExpression: '@tc_checkout_buy' }, { tagExpression: '@smoke' }],
        steps: [
          { flowNodeId: 'node-open', order: 1, label: 'Open checkout' },
          { flowNodeId: 'node-pay', order: 2, label: 'Pay with card' },
        ],
        flowBlocks: [
          {
            id: 'block-payment',
            name: 'Payment',
            order: 0,
            nodes: [{ flowNodeId: 'node-pay' }, { flowNodeId: 'missing-node' }],
          },
        ],
      },
    ],
  })

  expect(metadata).toEqual({
    version: 1,
    testSuite: {
      name: 'Checkout suite',
      modulePath: '/commerce/checkout',
    },
    testCases: [
      {
        identifierTag: '@tc_checkout_buy',
        title: 'Buys item',
        description: 'Happy path',
        nodes: [
          { nodeId: 'node-open', order: 1, label: 'Open checkout' },
          { nodeId: 'node-pay', order: 2, label: 'Pay with card' },
        ],
        flowBlocks: [
          {
            id: 'block-payment',
            name: 'Payment',
            order: 0,
            nodeIds: ['node-pay'],
          },
        ],
      },
    ],
  })
})

test('reads missing and malformed sidecars without throwing', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'appraise-metadata-'))
  const featurePath = join(dir, 'sample.feature')
  const metadataPath = getAppraiseMetadataPath(featurePath)

  await expect(readAppraiseMetadataFile(metadataPath)).resolves.toEqual({ metadata: null, warnings: [] })

  await fs.writeFile(metadataPath, '{', 'utf8')

  const result = await readAppraiseMetadataFile(metadataPath)

  expect(result.metadata).toBeNull()
  expect(result.warnings).toHaveLength(1)
})
