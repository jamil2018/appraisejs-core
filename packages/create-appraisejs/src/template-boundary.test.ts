import { describe, expect, it } from 'vitest'
import { isRepoOnlyTemplatePath, REPO_ONLY_TEMPLATE_SCRIPT_NAMES } from './template-boundary.js'

describe('isRepoOnlyTemplatePath', () => {
  it('excludes swarm orchestration assets from generated scaffolds', () => {
    expect(isRepoOnlyTemplatePath('.agents/skills/swarm-orchestrator/SKILL.md')).toBe(true)
    expect(isRepoOnlyTemplatePath('.codex/agents/judge.toml')).toBe(true)
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
    expect([...REPO_ONLY_TEMPLATE_SCRIPT_NAMES]).toEqual([
      'check:swarm-harness',
      'swarm:record',
      'swarm:route',
      'swarm:evolve',
      'swarm:ledger',
      'test:swarm-harness',
    ])
  })
})
