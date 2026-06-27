import { describe, expect, it } from 'vitest'

import {
  MAX_ARTIFACT_BYTES,
  PLAN_LIFECYCLE_STATES,
  PLAN_LIFECYCLE_TRANSITIONS,
  PlanContractError,
  assertPlanTransition,
  parseJsonArtifact,
  parseYamlArtifact,
  planArtifactSchema,
  serializeJsonArtifact,
  serializeYamlArtifact,
} from './index'

const plan = {
  version: '1',
  planId: 'checkout-redesign',
  revision: 1,
  lifecycle: 'draft',
  goal: 'Improve checkout reliability',
  description: 'Strengthen checkout validation and cover the updated behavior with focused tests.',
  tasks: [
    {
      id: 'add-validation',
      title: 'Add validation',
      description: 'Validate checkout input',
      acceptanceCriteria: ['Invalid input is rejected'],
      validationIntent: 'Add a focused unit test',
    },
  ],
  edges: [],
  implementationGroups: [{ id: 'checkout', taskIds: ['add-validation'] }],
} as const

describe('artifact schemas and codecs', () => {
  it('accepts a V1 plan and round trips deterministic LF JSON and YAML', () => {
    expect(planArtifactSchema.parse(plan)).toEqual(plan)

    const json = serializeJsonArtifact('plan', plan)
    const yaml = serializeYamlArtifact('plan', plan)

    expect(json.endsWith('\n')).toBe(true)
    expect(yaml.endsWith('\n')).toBe(true)
    expect(json).not.toContain('\r')
    expect(yaml).not.toContain('\r')
    expect(serializeJsonArtifact('plan', parseJsonArtifact('plan', json))).toBe(json)
    expect(serializeYamlArtifact('plan', parseYamlArtifact('plan', yaml))).toBe(yaml)
  })

  it.each([
    ['unknown-version', () => parseJsonArtifact('plan', JSON.stringify({ ...plan, version: '2' }))],
    ['duplicate-id', () => planArtifactSchema.parse({ ...plan, tasks: [plan.tasks[0], plan.tasks[0]] })],
    [
      'invalid-timestamp',
      () =>
        parseJsonArtifact(
          'review',
          JSON.stringify({
            version: '1',
            planId: 'checkout-redesign',
            threads: [],
            planApprovals: [
              {
                id: 'approval-one',
                revision: 1,
                contentHash: `sha256:${'a'.repeat(64)}`,
                relevantHashes: {},
                approvedBy: 'user',
                approvedAt: 'yesterday',
              },
            ],
            fileApprovals: [],
          }),
        ),
    ],
    ['runtime-owned-field', () => parseJsonArtifact('plan', JSON.stringify({ ...plan, evidence: [] }))],
    ['artifact-too-large', () => parseJsonArtifact('plan', ' '.repeat(MAX_ARTIFACT_BYTES + 1))],
    ['duplicate-key', () => parseYamlArtifact('plan', 'version: "1"\nversion: "1"\n')],
    ['unsafe-alias', () => parseYamlArtifact('plan', 'version: &version "1"\ncopy: *version\n')],
  ])('rejects invalid input with stable code %s', (code, operation) => {
    expect(operation).toThrowError(expect.objectContaining({ code }))
  })

  it('allows asterisks in prose without allowing YAML anchors', () => {
    expect(() =>
      parseYamlArtifact(
        'plan',
        serializeYamlArtifact('plan', {
          ...plan,
          planId: 'glob-text',
          description: 'Review markdown files such as *.md without creating YAML aliases.',
          tasks: [
            {
              ...plan.tasks[0],
              validationIntent: 'Inspect files matching *.md as plain text.',
            },
          ],
        }),
      ),
    ).not.toThrow()
    expect(() => parseYamlArtifact('plan', 'version: &version "1"\nplanId: anchor-plan\n')).toThrowError(
      expect.objectContaining({ code: 'unsafe-alias' }),
    )
  })

  it('requires a description and limits the plan title to 80 characters', () => {
    expect(planArtifactSchema.safeParse({ ...plan, description: '' }).success).toBe(false)
    expect(planArtifactSchema.safeParse({ ...plan, goal: 'a'.repeat(81) }).success).toBe(false)
  })
})

describe('plan lifecycle', () => {
  it('accepts every declared transition and rejects every other transition', () => {
    for (const from of PLAN_LIFECYCLE_STATES) {
      for (const to of PLAN_LIFECYCLE_STATES) {
        if (PLAN_LIFECYCLE_TRANSITIONS[from].includes(to)) {
          expect(() => assertPlanTransition(from, to)).not.toThrow()
        } else {
          expect(() => assertPlanTransition(from, to)).toThrowError(
            expect.objectContaining<Partial<PlanContractError>>({ code: 'invalid-transition' }),
          )
        }
      }
    }
  })
})
