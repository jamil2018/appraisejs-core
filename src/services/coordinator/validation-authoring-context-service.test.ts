import { describe, expect, it } from 'vitest'
import type { PlanArtifact } from '@/lib/plan-contract'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'
import {
  applyAuthoringResponseMode,
  MCP_RESPONSE_TOKEN_BUDGETS,
  measureMcpResponse,
} from '../../../packages/appraisejs/src/mcp/response-projector'

import { buildValidationAuthoringKit, rankReadyStepDefinitions } from './validation-authoring-context-service'
import {
  validationResourceProposalBindingExample,
  validationResourceProposalBindingsSchema,
  validationResourceProposalContract,
  validationResourceProposalExample,
  validationResourceProposalSchema,
} from './validation-resource-proposal-contract'

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
    expect(first.resourceProposalContract).toEqual(second.resourceProposalContract)
    expect(first.resourceProposalContract).toEqual(validationResourceProposalContract)
  })

  it('exposes a schema-valid generic resource proposal and returned binding example', () => {
    expect(validationResourceProposalSchema.parse(validationResourceProposalExample)).toEqual(
      validationResourceProposalExample,
    )
    expect(validationResourceProposalBindingsSchema.parse(validationResourceProposalBindingExample)).toEqual(
      validationResourceProposalBindingExample,
    )
    expect(validationResourceProposalContract).toMatchObject({
      contractId: 'appraise.validation/resource-proposal',
      version: 2,
      request: {
        additionalProperties: false,
        properties: {
          idempotencyKey: { minLength: 1, maxLength: 80, pattern: expect.any(String) },
          locatorGroups: { maxItems: 50 },
          locators: { maxItems: 200 },
        },
      },
      relationshipRules: expect.arrayContaining([
        expect.objectContaining({ id: 'locator-group-module-reference' }),
        expect.objectContaining({ id: 'locator-group-reference' }),
      ]),
      responseBindingExample: validationResourceProposalBindingExample,
    })
    expect(() =>
      validationResourceProposalSchema.parse({
        ...validationResourceProposalExample,
        modules: [
          { localKey: 'first', name: 'First', parentKey: 'second' },
          { localKey: 'second', name: 'Second', parentKey: 'first' },
        ],
        locatorGroups: [],
        locators: [],
      }),
    ).toThrow(/acyclic/)
    expect(() =>
      validationResourceProposalSchema.parse({
        ...validationResourceProposalExample,
        environments: [
          {
            localKey: 'local',
            name: 'Local',
            baseUrl: 'https://example.test',
            expectedPageTitle: `${'x'.repeat(200)} `,
          },
        ],
      }),
    ).toThrow()
  })

  it('keeps the complete generic proposal contract in the bounded default MCP response', () => {
    const authoring = buildValidationAuthoringKit({
      plan,
      sourceHash: `sha256:${'d'.repeat(64)}`,
      targetProject: null,
      resources,
    })
    const compact = applyAuthoringResponseMode(
      {
        plan: { planId: plan.planId, sourceHash: `sha256:${'d'.repeat(64)}` },
        contextHash: `sha256:${'e'.repeat(64)}`,
        authoring,
      },
      'summary',
    )

    expect(compact).toMatchObject({
      resourceProposalContract: validationResourceProposalContract,
    })
    expect(compact).not.toHaveProperty('authoring')
    expect(measureMcpResponse(compact).estimatedTokens).toBeLessThan(MCP_RESPONSE_TOKEN_BUDGETS.validationMutation)
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
