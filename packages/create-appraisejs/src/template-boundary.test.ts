import { describe, expect, it } from 'vitest'
import { shouldExcludePreparedConfigPath } from '../scripts/template-config-filter.js'
import { isRepoOnlyTemplatePath, REPO_ONLY_TEMPLATE_SCRIPT_NAMES } from './template-boundary.js'

describe('isRepoOnlyTemplatePath', () => {
  it('excludes swarm orchestration assets from generated scaffolds', () => {
    expect(isRepoOnlyTemplatePath('.agents/skills/swarm-orchestrator/SKILL.md')).toBe(true)
    expect(isRepoOnlyTemplatePath('.codex/agents/judge.toml')).toBe(true)
    expect(isRepoOnlyTemplatePath('config/development-harness/model-catalog.json')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/lib/harness-learning.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/check-swarm-harness.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/record-swarm-run.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/record-swarm-route.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/update-swarm-evolution.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/swarm-ledger.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/lib/swarm-cli.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/lib/swarm-ledger-lock.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/lib/swarm-ledger-store.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/lib/toml-validator.mjs')).toBe(true)
    expect(isRepoOnlyTemplatePath('scripts/tests/swarm-evolution.test.mjs')).toBe(true)
  })

  it('keeps project-owned runtime scripts available', () => {
    expect(isRepoOnlyTemplatePath('scripts/check-agent-harness.mjs')).toBe(false)
    expect(isRepoOnlyTemplatePath('scripts/sync-step-definitions.ts')).toBe(false)
  })
})

describe('REPO_ONLY_TEMPLATE_SCRIPT_NAMES', () => {
  it('does not expose swarm administration commands from generated projects', () => {
    expect([...REPO_ONLY_TEMPLATE_SCRIPT_NAMES]).toEqual(
      expect.arrayContaining([
        'check:swarm-harness',
        'swarm:record',
        'swarm:route',
        'swarm:evolve',
        'swarm:ledger',
        'test:swarm-harness',
        'harness:learn',
        'harness:validate',
      ]),
    )
  })
})

describe('prepared config boundary', () => {
  it.each([
    'cache.db',
    'nested/node_modules/private.json',
    'cache.tsbuildinfo',
    '.DS_Store',
    'graphify-out/graph.json',
    'development-harness/model-catalog.json',
  ])('excludes %s while composing global and repository-only policies', file => {
    expect(shouldExcludePreparedConfigPath(file)).toBe(true)
  })
  it('retains public app configuration', () => {
    expect(shouldExcludePreparedConfigPath('fallow-baseline-root.json')).toBe(false)
  })
})
