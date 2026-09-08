import { describe, expect, it } from 'vitest'

import { isStrictlyDocumentationOnly } from './commit-scope-policy.mjs'

describe('isStrictlyDocumentationOnly', () => {
  it('accepts ordinary documentation paths', () => {
    expect(isStrictlyDocumentationOnly([{ status: 'M', path: 'docs/agent-harness.md' }])).toBe(true)
  })

  it('retains code analysis for source, configuration, and renamed source paths', () => {
    expect(isStrictlyDocumentationOnly([{ status: 'M', path: 'src/example.ts' }])).toBe(false)
    expect(isStrictlyDocumentationOnly([{ status: 'M', path: 'package.json' }])).toBe(false)
    expect(isStrictlyDocumentationOnly([{ status: 'R', oldPath: 'src/example.ts', path: 'docs/example.md' }])).toBe(
      false,
    )
  })
})
