import { describe, expect, it } from 'vitest'

import type { ValidationArtifact } from '@/lib/plan-contract'

import { validateValidationLocatorBindings } from './validation-locator-resolution-service'

function validationNode(): ValidationArtifact['validations'][number] {
  return {
    id: 'notes-flow',
    taskIds: ['notes-task'],
    required: true,
    testCaseIds: ['notes-case'],
    appraiseArtifacts: {
      modules: [{ id: 'notes-module', name: 'Notes' }],
      testSuites: [{ id: 'notes-suite', name: 'Notes suite', moduleId: 'notes-module', testCaseIds: ['notes-case'] }],
      testCases: [
        {
          id: 'notes-case',
          title: 'Create note',
          description: 'Creates a note.',
          steps: [
            {
              id: 'fill-title',
              order: 0,
              label: 'Fill title',
              gherkinStep: 'When I fill the title',
              parameters: [{ name: 'target', value: 'Title', type: 'LOCATOR', locatorName: 'Title' }],
            },
          ],
        },
      ],
      locatorGroups: [{ id: 'notes-form', name: 'Notes form', route: '/', moduleId: 'notes-module' }],
      locators: [{ id: 'title-input', name: 'Title', value: '[name="title"]', locatorGroupId: 'notes-form' }],
    },
    gherkinPaths: ['automation/features/notes.feature'],
    stepPaths: [],
    executable: { path: 'automation/features/notes.feature' },
    astProvenance: {
      schemaVersion: '2',
      astHash: `sha256:${'a'.repeat(64)}`,
      executionAuthority: 'runtime_capsule',
      publishOperationId: 'publish-notes',
      receiptHash: `sha256:${'b'.repeat(64)}`,
      runtimeInputHash: `sha256:${'c'.repeat(64)}`,
    },
    matrix: [{ browser: 'chromium', environment: 'local' }],
    expectedFailures: [],
  }
}

describe('validation locator resolution', () => {
  it('accepts one canonical locator binding', () => {
    expect(validateValidationLocatorBindings([validationNode()])).toEqual([])
  })

  it('reports missing locator context with a corrective action', () => {
    const node = validationNode()
    node.appraiseArtifacts.locators = []

    expect(validateValidationLocatorBindings([node])).toEqual([
      expect.objectContaining({
        code: 'missing-locator-reference',
        phrase: 'Title',
        message: expect.stringContaining('case "notes-case", step "fill-title"'),
        recovery: expect.stringContaining('locator_search'),
      }),
    ])
  })

  it('rejects duplicate names and stale locator groups', () => {
    const duplicate = validationNode()
    duplicate.appraiseArtifacts.locators.push({
      id: 'other-title',
      name: 'Title',
      value: '#title',
      locatorGroupId: 'notes-form',
    })
    expect(validateValidationLocatorBindings([duplicate])).toEqual([
      expect.objectContaining({ code: 'ambiguous-locator-reference' }),
    ])

    const stale = validationNode()
    stale.appraiseArtifacts.locatorGroups = []
    expect(validateValidationLocatorBindings([stale])).toEqual([
      expect.objectContaining({ code: 'stale-locator-reference' }),
    ])
  })
})
