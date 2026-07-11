import { describe, expect, it } from 'vitest'

import { locatorCatalogReferenceSchema } from './references'
import { locatorDescriptorSchema } from '@/lib/locator-graph'
import { locatorReferenceSchema } from '@/lib/validation-ast'

const hash = `sha256:${'a'.repeat(64)}`

describe('locator reference parity', () => {
  it.each(['checkout-button', '123e4567-e89b-12d3-a456-426614174000', 'loc_01abc-def'])(
    'uses the same legacy/opaque ID domain for graph and AST refs: %s',
    id => {
      const descriptor = locatorDescriptorSchema.parse({
        id,
        version: '1',
        title: 'Checkout',
        type: 'locator',
        groupId: 'checkout-group',
        scope: { surfaceId: 'checkout', availableStates: [] },
        strategy: { type: 'test-id', value: { value: 'checkout' } },
        compatibleActionCategories: [],
        contentHash: hash,
      })
      expect(locatorCatalogReferenceSchema.parse(descriptor)).toEqual({ id, version: '1' })
      expect(locatorReferenceSchema.parse({ ref: 'locator', id, version: descriptor.version })).toMatchObject({ id })
    },
  )
})
