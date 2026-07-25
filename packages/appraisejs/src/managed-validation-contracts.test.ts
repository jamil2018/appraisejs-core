import { describe, expect, expectTypeOf, it } from 'vitest'
import type { CustomActionExtensionProposal, ValidationAstSubmission } from './managed-validation-contracts.js'
import { VALIDATION_AST_SCHEMA_VERSION } from './managed-validation-contracts.js'

describe('Managed validation public contract parity', () => {
  it('exports submission and custom-extension proposal types at schema version 2', () => {
    expect(VALIDATION_AST_SCHEMA_VERSION).toBe(2)
    expectTypeOf<
      ValidationAstSubmission['customExtensionProposals'][number]
    >().toEqualTypeOf<CustomActionExtensionProposal>()
  })
})
