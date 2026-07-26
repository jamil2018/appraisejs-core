import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { expect, test } from 'vitest'

import { getAppraiseMetadataPath } from '@/lib/appraise-test-case-metadata'
import { parseFeatureFile } from '@/lib/gherkin-parser'

async function withTempFeatureFile(content: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'gherkin-parser-'))
  const filePath = join(dir, 'sample.feature')
  await fs.writeFile(filePath, content, 'utf8')
  return filePath
}

test('uses Feature line text as feature description', async () => {
  const filePath = await withTempFeatureFile(`
@smoke
Feature: Login workflow

Scenario: logs in
  Given user opens app
`)

  const parsed = await parseFeatureFile(filePath)

  expect(parsed).not.toBeNull()
  expect(parsed?.featureName).toBe('Login workflow')
  expect(parsed?.featureDescription).toBe('Login workflow')
})

test('keeps Feature line as description even when free text follows', async () => {
  const filePath = await withTempFeatureFile(`
Feature: Checkout flow
Legacy block text that should not override the description

Scenario: buys item
  Given user adds item to cart
`)

  const parsed = await parseFeatureFile(filePath)

  expect(parsed).not.toBeNull()
  expect(parsed?.featureDescription).toBe('Checkout flow')
})

test('attaches adjacent Appraise metadata to matching scenarios', async () => {
  const filePath = await withTempFeatureFile(`
Feature: Checkout flow

@tc_checkout_buy @smoke
Scenario: [Legacy description] Legacy title
  Given user adds item to cart
`)
  await fs.writeFile(
    getAppraiseMetadataPath(filePath),
    JSON.stringify({
      version: 1,
      testSuite: { name: 'checkout-flow', modulePath: '/checkout' },
      testCases: [
        {
          identifierTag: '@tc_checkout_buy',
          title: 'Buys item',
          description: 'Happy path',
          nodes: [
            {
              nodeId: 'node-cart',
              order: 1,
              label: 'Add item',
              invocation: {
                step: {
                  id: 'browser.cart.add-item',
                  version: '1',
                  definitionHash: `sha256:${'a'.repeat(64)}`,
                },
                inputs: {},
              },
            },
          ],
          flowBlocks: [{ id: 'block-cart', name: 'Cart', order: 0, nodeIds: ['node-cart'] }],
        },
      ],
    }),
    'utf8',
  )

  const parsed = await parseFeatureFile(filePath)

  expect(parsed?.scenarios[0]?.appraiseMetadata).toMatchObject({
    title: 'Buys item',
    description: 'Happy path',
    nodes: [{ nodeId: 'node-cart', order: 1, label: 'Add item' }],
  })
})

test('falls back to feature-only parsing when sidecar is malformed', async () => {
  const filePath = await withTempFeatureFile(`
Feature: Checkout flow

@tc_checkout_buy
Scenario: buys item
  Given user adds item to cart
`)
  await fs.writeFile(getAppraiseMetadataPath(filePath), '{', 'utf8')

  const parsed = await parseFeatureFile(filePath)

  expect(parsed?.scenarios[0]?.appraiseMetadata).toBeUndefined()
  expect(parsed?.metadataWarnings).toHaveLength(1)
})
