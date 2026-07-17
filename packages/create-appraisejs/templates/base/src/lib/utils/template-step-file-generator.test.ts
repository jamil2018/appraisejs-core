import { describe, expect, it } from 'vitest'
import type { TemplateStep } from '@prisma/client'

import { generateFileContent } from './template-step-file-generator'

describe('template step file generator', () => {
  it('imports the structured-operation helpers used by registry-backed step definitions', () => {
    const source = generateFileContent([
      {
        name: 'structured operation',
        description: null,
        icon: 'DEBUG',
        functionDefinition:
          "When('a structured operation runs', async function () { await runPageTemplateOperation(this.page, 'reload', '[]', '{}', () => undefined) })",
      } as TemplateStep,
    ])

    expect(source).toContain('runLocatorTemplateOperation')
    expect(source).toContain('runPageTemplateOperation')
  })
})
