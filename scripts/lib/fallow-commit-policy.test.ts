import { describe, expect, it } from 'vitest'

import { requiresReleaseBaselineAudit } from './fallow-commit-policy.mjs'

describe('requiresReleaseBaselineAudit', () => {
  it('uses release baselines when a Fallow suppression is removed', () => {
    expect(requiresReleaseBaselineAudit('-// fallow-ignore-next-line complexity\n function work() {}')).toBe(true)
  })

  it('retains the changed-code audit for ordinary changes', () => {
    expect(requiresReleaseBaselineAudit('+function work() {}')).toBe(false)
  })

  it('uses release baselines for a release-scale staged cutover', () => {
    const patch = Array.from(
      { length: 100 },
      (_, index) => `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
    ).join('\n')

    expect(requiresReleaseBaselineAudit(patch)).toBe(true)
  })

  it('counts non-code staged files when routing a release-scale cutover', () => {
    const stagedFiles = Array.from({ length: 100 }, (_, index) => `docs/file-${index}.md`).join('\n')

    expect(requiresReleaseBaselineAudit('+function work() {}', stagedFiles)).toBe(true)
  })

  it('keeps release-scale routing when the cutover includes a suppression', () => {
    const patch = Array.from(
      { length: 100 },
      (_, index) => `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
    ).join('\n')

    expect(requiresReleaseBaselineAudit(`${patch}\n+// fallow-ignore-next-line unused-export`)).toBe(true)
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
