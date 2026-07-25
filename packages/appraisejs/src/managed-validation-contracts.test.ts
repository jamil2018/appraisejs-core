import { describe, expect, expectTypeOf, it } from 'vitest'
import type { CustomActionExtensionProposal, ValidationAstSubmission } from './managed-validation-contracts.js'
import { VALIDATION_AST_JSON_SCHEMA, VALIDATION_AST_SCHEMA_VERSION } from './managed-validation-contracts.js'

describe('Managed validation public contract parity', () => {
  it('exports submission and custom-extension proposal types at schema version 2', () => {
    expect(VALIDATION_AST_SCHEMA_VERSION).toBe(2)
    expectTypeOf<
      ValidationAstSubmission['customExtensionProposals'][number]
    >().toEqualTypeOf<CustomActionExtensionProposal>()
    expectTypeOf<ValidationAstSubmission['stepDefinitionSelections']>().toEqualTypeOf<
      Array<{ receiptId: string; correlationId: string }> | undefined
    >()
    type HasSingularSelection = 'stepDefinitionSelection' extends keyof ValidationAstSubmission ? true : false
    expectTypeOf<HasSingularSelection>().toEqualTypeOf<false>()
  })

  it('publishes plural bounded search selections and excludes the stale singular field', () => {
    expect(VALIDATION_AST_JSON_SCHEMA.properties.stepDefinitionSelections).toMatchObject({
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['receiptId', 'correlationId'],
        properties: {
          receiptId: { type: 'string', format: 'uuid' },
          correlationId: { type: 'string', maxLength: 100, pattern: '^[a-zA-Z0-9._:-]+$' },
        },
      },
    })
    expect(VALIDATION_AST_JSON_SCHEMA.properties).not.toHaveProperty('stepDefinitionSelection')
  })
})
