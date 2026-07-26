import { describe, expect, it, vi } from 'vitest'

import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'
import { computeStepDefinitionHashes } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { readyStepDefinitionRowsForSearch } from './ready-step-definition-search-index'

describe('ready Step Definition search index rows', () => {
  it('uses the ready manifest to avoid repeated full definition scans', async () => {
    const definition = builtInStepDefinitions[0]!
    const findMany = vi.fn().mockImplementation(({ select }: { select: Record<string, unknown> }) => {
      if ('definitionHash' in select)
        return [{ id: definition.identity.id, version: definition.identity.version, definitionHash: computeStepDefinitionHashes(definition).definitionHash }]
      return [
        {
          id: definition.identity.id,
          version: definition.identity.version,
          title: definition.intent.title,
          description: definition.intent.description,
          definitionJson: JSON.stringify(definition),
        },
      ]
    })
    const database = { stepDefinition: { findMany } } as never

    await expect(readyStepDefinitionRowsForSearch(database)).resolves.toHaveLength(1)
    await expect(readyStepDefinitionRowsForSearch(database)).resolves.toHaveLength(1)

    expect(findMany).toHaveBeenCalledTimes(3)
    expect(findMany.mock.calls.filter(([input]) => 'definitionJson' in input.select)).toHaveLength(1)
  })
})
