import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { readTemplateStepOperationMappings } from './operation-ledger-reader'

describe('operation ledger reader', () => {
  it('projects every approved legacy signature to one canonical operation mapping', async () => {
    const mappings = await readTemplateStepOperationMappings(path.resolve(import.meta.dirname, '../..'))
    expect(mappings).toHaveLength(125)
    expect(mappings.get('the user clicks on the {string} element')).toMatchObject({
      operationId: 'browser.mouse.click',
      operationVersion: '1',
      operationDescriptorHash: expect.stringMatching(/^sha256:/),
      operationMigrationState: 'mapped',
    })
    expect(mappings.get('the user double clicks on the {string} element')).toMatchObject({
      operationId: 'browser.click.double.click',
      operationDescriptorHash: expect.stringMatching(/^sha256:/),
      operationMigrationState: 'mapped',
    })
  })
})
