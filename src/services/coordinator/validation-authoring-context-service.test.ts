import { describe, expect, it } from 'vitest'

import type { PlanArtifact } from '@/lib/plan-contract'

import { buildValidationAuthoringKit } from './validation-authoring-context-service'

const plan = {
  version: '1',
  planId: 'plan-one',
  revision: 1,
  lifecycle: 'approved',
  goal: 'Create todos',
  description: 'Create and retain a todo.',
  tasks: [
    {
      id: 'create-todo',
      title: 'Create todo',
      description: 'Add a todo.',
      acceptanceCriteria: ['Todo appears.'],
      validationIntent: 'Create a todo and observe it.',
    },
  ],
  edges: [],
  implementationGroups: [{ id: 'core', taskIds: ['create-todo'] }],
} as unknown as PlanArtifact

describe('validation authoring kit', () => {
  it('creates a deterministic editable starter without claiming coverage', () => {
    const input = {
      plan,
      sourceHash: `sha256:${'a'.repeat(64)}`,
      targetProject: null,
      resources: { templateSteps: [], stepBlocks: [], locatorGroups: [], locators: [], environments: [] },
    }
    const first = buildValidationAuthoringKit(input)
    const second = buildValidationAuthoringKit(input)
    expect(first.astExchange).toEqual(second.astExchange)
    expect(first.astStarter.submission.ast.coverageArgument?.mappings[0]).toMatchObject({ state: 'uncovered' })
    expect(first.runtimePreparationProposal).toMatchObject({
      status: 'review_required',
      targetWorkspaceMutation: 'none',
    })
  })

  it('packages bounded approved intent, reusable summaries, and registry-first recipes', () => {
    const kit = buildValidationAuthoringKit({
      plan,
      sourceHash: `sha256:${'b'.repeat(64)}`,
      targetProject: { id: 'project-one', displayName: 'One', canonicalPath: '/tmp/one', fingerprint: 'sha256:one' },
      resources: {
        templateSteps: [{ id: 'step-one', name: 'Click', signature: 'click {target}' }],
        stepBlocks: [],
        locatorGroups: [],
        locators: [],
        environments: [{ id: 'local', name: 'Local', baseUrl: 'http://localhost:3000', apiBaseUrl: null }],
      },
    })
    expect(kit.contextPack.reusableResourceSummary).toMatchObject({ templateSteps: 1, environments: 1 })
    expect(kit.recipes[0]?.actionIds[0]).toBe('browser.navigation.goto')
    expect(kit.runtimePreparationProposal.status).toBe('ready')
  })
})
