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

  it('allows only reviewed files in canonical Graphify scopes', () => {
    expect(runtimeArtifactReason('src/graphify-out/graph.json')).toBeNull()
    expect(runtimeArtifactReason('prisma/graphify-out/graph.html')).toBeNull()
    expect(runtimeArtifactReason('scripts/graphify-out/GRAPH_REPORT.md')).toBeNull()
    expect(runtimeArtifactReason('packages/graphify-out/graph.json')).toBeNull()

    expect(runtimeArtifactReason('graphify-out/graph.json')).toBe('non-canonical Graphify output')
    expect(runtimeArtifactReason('src/graphify-out/cache/ast.json')).toBe('non-canonical Graphify output')
    expect(runtimeArtifactReason('packages/create-appraisejs/templates/base/src/graphify-out/graph.json')).toBe(
      'non-canonical Graphify output',
    )
    expect(runtimeArtifactReason('codex/plan/graphify-out/GRAPH_REPORT.md')).toBe('non-canonical Graphify output')
  })

  it('reports only forbidden paths', () => {
    expect(findForbiddenRuntimeArtifacts(['src/index.ts', '.appraise/project.json'])).toEqual([
      { file: '.appraise/project.json', reason: 'runtime or build output' },
    ])
  })
})
