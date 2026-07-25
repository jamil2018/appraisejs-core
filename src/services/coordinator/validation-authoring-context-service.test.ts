import { describe, expect, it } from 'vitest'
import type { PlanArtifact } from '@/lib/plan-contract'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'

import { buildValidationAuthoringKit, rankReadyStepDefinitions } from './validation-authoring-context-service'

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
  const readyDefinitions = builtInStepDefinitions.map(definition => ({
    id: definition.identity.id,
    version: definition.identity.version,
    title: definition.intent.title,
    description: definition.intent.description,
    definitionJson: JSON.stringify(definition),
  }))
  const resources = {
    stepDefinitions: readyDefinitions,
    locatorGroups: [],
    locators: [],
    environments: [],
  }

  it('ranks ready Step Definitions and returns an exact content-addressed reference', () => {
    const ranked = rankReadyStepDefinitions(readyDefinitions, 'navigate to url', ['url'])
    expect(ranked[0]?.value.step).toMatchObject({ id: 'browser.navigation.goto', version: '1' })
    expect(ranked[0]?.value.step.definitionHash).toMatch(/^sha256:/)
  })

  it('creates a deterministic editable starter without claiming coverage', () => {
    const input = {
      plan,
      sourceHash: `sha256:${'a'.repeat(64)}`,
      targetProject: null,
      resources,
    }
    const first = buildValidationAuthoringKit(input)
    const second = buildValidationAuthoringKit(input)
    expect(first.astExchange).toEqual(second.astExchange)
    expect(first.astStarter.submission!.ast.coverageArgument?.mappings[0]).toMatchObject({ state: 'uncovered' })
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
        stepDefinitions: readyDefinitions,
        locatorGroups: [],
        locators: [],
        environments: [
          {
            id: 'local',
            name: 'Local',
            baseUrl: 'http://localhost:3000',
            apiBaseUrl: null,
            expectedPageTitle: null,
          },
        ],
      },
    })
    expect(kit.contextPack.reusableResourceSummary).toMatchObject({
      stepDefinitions: readyDefinitions.length,
      environments: 1,
    })
    expect(kit.recipes[0]?.stepIds[0]).toBe('browser.navigation.goto')
    expect(kit.runtimePreparationProposal.status).toBe('ready')
  })

  it('keeps resource authoring available when a legacy plan has no tasks', () => {
    const kit = buildValidationAuthoringKit({
      plan: { ...plan, tasks: [], implementationGroups: [] } as unknown as PlanArtifact,
      sourceHash: `sha256:${'c'.repeat(64)}`,
      targetProject: null,
      resources,
    })

    expect(kit.astStarter).toMatchObject({
      editable: false,
      readiness: 'unavailable_no_plan_tasks',
      submission: null,
    })
    expect(kit.astExchange).toBeNull()
  })
})
