import { describe, expect, it } from 'vitest'

import { findForbiddenRuntimeArtifacts, runtimeArtifactReason } from '../check-generated-artifacts.mjs'

describe('generated artifact policy', () => {
  it.each([
    '.appraise/projects/project/runtime/run/report.json',
    '.playwright-cli/page.yml',
    'automation/reports/cucumber.json',
    'playwright-report/index.html',
    'test-results/trace.zip',
    'packages/appraisejs/dist/index.js',
    'prisma/dev.db',
  ])('rejects runtime path %s', file => {
    expect(runtimeArtifactReason(file)).not.toBeNull()
  })

  it('allows only the named sanitized scaffold databases', () => {
    expect(runtimeArtifactReason('packages/create-appraisejs/templates/flavors/starter/prisma/dev.db')).toBeNull()
    expect(runtimeArtifactReason('fixtures/copied-production.sqlite')).toBe('local database')
  })

  it('reports only forbidden paths', () => {
    expect(findForbiddenRuntimeArtifacts(['src/index.ts', '.appraise/project.json'])).toEqual([
      { file: '.appraise/project.json', reason: 'runtime or build output' },
    ])
  })
})
