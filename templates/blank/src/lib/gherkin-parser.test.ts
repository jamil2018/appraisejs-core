import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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

  assert.ok(parsed)
  assert.equal(parsed?.featureName, 'Login workflow')
  assert.equal(parsed?.featureDescription, 'Login workflow')
})

test('keeps Feature line as description even when free text follows', async () => {
  const filePath = await withTempFeatureFile(`
Feature: Checkout flow
Legacy block text that should not override the description

Scenario: buys item
  Given user adds item to cart
`)

  const parsed = await parseFeatureFile(filePath)

  assert.ok(parsed)
  assert.equal(parsed?.featureDescription, 'Checkout flow')
})
