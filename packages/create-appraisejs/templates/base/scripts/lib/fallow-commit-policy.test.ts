import { describe, expect, it } from 'vitest'

import { requiresReleaseBaselineAudit } from './fallow-commit-policy.mjs'

describe('requiresReleaseBaselineAudit', () => {
  it('uses release baselines when a Fallow suppression is removed', () => {
    expect(requiresReleaseBaselineAudit('-// fallow-ignore-next-line complexity\n function work() {}')).toBe(true)
  })

  it('retains the changed-code audit for ordinary changes', () => {
    expect(requiresReleaseBaselineAudit('+function work() {}')).toBe(false)
  })

  it('never grants the removal path when a suppression is added', () => {
    expect(
      requiresReleaseBaselineAudit('-// fallow-ignore-next-line complexity\n+// fallow-ignore-file code-duplication'),
    ).toBe(false)
  })

  it('ignores suppression text inside a test fixture string', () => {
    expect(
      requiresReleaseBaselineAudit(
        "-// fallow-ignore-next-line complexity\n+const fixture = '+// fallow-ignore-next-line complexity'",
      ),
    ).toBe(true)
  })
})
