import { describe, expect, it } from 'vitest'
import { StepParameterType, TemplateStepGroupType } from '@prisma/client'

import type { PlanArtifact } from '@/lib/plan-contract'

import { buildValidationAuthoringKit, rankReusableResources } from './validation-authoring-context-service'

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
  it('prefers exact ordered intent and named parameters over loose token overlap', () => {
    const group = {
      id: 'browser',
      name: 'Browser actions',
      description: null,
      type: TemplateStepGroupType.ACTION,
    }
    const templateStep = (
      id: string,
      name: string,
      signature: string,
      description: string,
      parameters: Array<{ name: string; type: StepParameterType; order: number }> = [],
      operation?: { id: string; version: string },
    ) => ({
      id,
      name,
      signature,
      description,
      operationId: operation?.id ?? null,
      operationVersion: operation?.version ?? null,
      operationDescriptorHash: operation ? `sha256:${'a'.repeat(64)}` : null,
      humanProjectionId: operation ? `${operation.id}.gherkin` : null,
      operationMigrationState: operation ? 'mapped' : 'handler-required',
      templateStepGroupId: group.id,
      templateStepGroup: group,
      parameters,
    })
    const resources = {
      templateSteps: [
        templateStep('forward', 'Browser forward', 'navigate browser forward', 'Navigate to the next history entry.'),
        templateStep('goto', 'Navigate to URL', 'navigate to {url}', 'Open an absolute or relative URL.', [
          { name: 'url', type: StepParameterType.STRING, order: 0 },
        ]),
        templateStep('cookie', 'Set cookie', 'set cookie {name}', 'Set a browser cookie.', [
          { name: 'name', type: StepParameterType.STRING, order: 0 },
        ]),
        templateStep(
          'viewport',
          'Set viewport size',
          'set viewport {width} by {height}',
          'Set viewport dimensions.',
          [
            { name: 'width', type: StepParameterType.NUMBER, order: 0 },
            { name: 'height', type: StepParameterType.NUMBER, order: 1 },
          ],
          { id: 'browser.viewport.set', version: '1' },
        ),
      ],
      stepBlocks: [],
    }

    expect(rankReusableResources(resources, 'navigate to url', ['url']).templateSteps[0]?.value.id).toBe('goto')
    expect(rankReusableResources(resources, 'set viewport size', ['width', 'height']).templateSteps[0]?.value.id).toBe(
      'viewport',
    )
    expect(rankReusableResources(resources, 'responsive mobile layout').templateSteps[0]?.value.id).toBe('viewport')
  })

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
        templateSteps: [{ id: 'step-one', name: 'Click', signature: 'click {target}' }],
        stepBlocks: [],
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
    expect(kit.contextPack.reusableResourceSummary).toMatchObject({ templateSteps: 1, environments: 1 })
    expect(kit.recipes[0]?.actionIds[0]).toBe('browser.navigation.goto')
    expect(kit.runtimePreparationProposal.status).toBe('ready')
  })

  it('keeps resource authoring available when a legacy plan has no tasks', () => {
    const kit = buildValidationAuthoringKit({
      plan: { ...plan, tasks: [], implementationGroups: [] } as unknown as PlanArtifact,
      sourceHash: `sha256:${'c'.repeat(64)}`,
      targetProject: null,
      resources: { templateSteps: [], stepBlocks: [], locatorGroups: [], locators: [], environments: [] },
    })

    expect(kit.astStarter).toMatchObject({
      editable: false,
      readiness: 'unavailable_no_plan_tasks',
      submission: null,
    })
    expect(kit.astExchange).toBeNull()
  })
})
