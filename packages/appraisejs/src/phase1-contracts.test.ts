import { describe, expect, expectTypeOf, it } from 'vitest'
import type { CustomActionExtensionProposal, ValidationAstSubmission } from './phase1-contracts.js'
import { VALIDATION_AST_SCHEMA_VERSION } from './phase1-contracts.js'

describe('Phase 1 public contract parity', () => {
  it('exports submission and custom-extension proposal types at V1', () => {
    expect(VALIDATION_AST_SCHEMA_VERSION).toBe('1')
    expectTypeOf<
      ValidationAstSubmission['customExtensionProposals'][number]
    >().toEqualTypeOf<CustomActionExtensionProposal>()
  })
})
