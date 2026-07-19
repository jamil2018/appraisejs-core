import { describe, expect, it } from 'vitest'

import { createActionCatalog } from '@/lib/action-catalog'
import { createLocatorGraph } from '@/lib/locator-graph'
import type { ValidationAstSubmission } from '@/lib/validation-ast'
import { checkValidationAst, previewValidationAst, type ValidationAstCompilerContext } from './compiler'
import { createCustomExtensionPolicy } from './extension-policy'
import { compileValidationAstNode } from '@/services/coordinator/validation-ast-compiler-service'

const hash = (character: string) => `sha256:${character.repeat(64)}`
const catalog = createActionCatalog({
  categories: [{ id: 'browser.forms', title: 'Forms', description: 'Form actions.' }],
  actions: [
    {
      id: 'browser.forms.fill',
      version: '1',
      title: 'Fill',
      description: 'Fill a field.',
      categories: ['browser.forms'],
      inputs: [
        { name: 'target', type: 'locator', required: true, description: 'Target.' },
        { name: 'value', type: 'string', required: true, description: 'Value.' },
      ],
      outputs: [{ name: 'entered-value', type: 'string', description: 'Entered value.' }],
      requirements: { runtime: 'browser', capabilities: ['forms'] },
      assertionConcerns: [],
      examples: [],
      deprecated: false,
    },
  ],
})
const locator = {
  id: 'title-input',
  persistentId: 'title-input-row',
  version: '1' as const,
  title: 'Title',
  type: 'locator' as const,
  groupId: 'form-fields',
  scope: { surfaceId: 'todo-page', availableStates: [] },
  strategy: { type: 'label' as const, value: { label: 'Title' } },
  compatibleActionCategories: ['browser.forms'],
  contentHash: hash('c'),
}
const graph = createLocatorGraph({
  version: '1',
  nodes: [
    { id: 'todo-page', version: '1', title: 'Todo', type: 'surface', kind: 'page', route: '/' },
    { id: 'form-fields', version: '1', title: 'Fields', type: 'locator-group', surfaceId: 'todo-page' },
    locator,
  ],
  edges: [
    { id: 'page-fields', fromId: 'todo-page', toId: 'form-fields', relation: 'contains' },
    { id: 'fields-title', fromId: 'form-fields', toId: 'title-input', relation: 'contains' },
  ],
})
const context: ValidationAstCompilerContext = {
  project: { id: 'project-one', fingerprint: hash('p') },
  planScope: `${hash('p')}:plan-one`,
  currentPlanHash: hash('a'),
  planTaskIds: ['task-one'],
  actionCatalog: catalog,
  locatorGraph: graph,
  environments: { local: { keys: ['base-url'] } },
  availableRuntimes: ['browser'],
  availableCapabilities: ['forms'],
  extensionPolicy: createCustomExtensionPolicy({
    projectId: 'project-one',
    projectFingerprint: hash('p'),
    capabilityImports: { browser: ['@playwright/test'] },
  }),
}
const submission = {
  expectedPlanHash: hash('a'),
  ast: {
    schemaVersion: 1,
    id: 'todo-validation',
    title: 'Todo validation',
    purpose: 'Verify todo entry.',
    coversTaskIds: ['task-one'],
    matrix: [{ browser: 'chromium', environmentId: 'local' }],
    expectedFailures: [],
    scenarios: [
      {
        id: 'create-todo',
        title: 'Create todo',
        steps: [
          {
            id: 'fill-title',
            keyword: 'When',
            description: 'the user fills the title',
            action: {
              id: 'browser.forms.fill',
              version: '1',
              inputs: { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Meditate' },
            },
            store: { output: 'entered-value', as: 'title-value' },
          },
        ],
      },
    ],
    qualityConcerns: ['accessibility'],
    coverageArgument: {
      mappings: [
        {
          kind: 'task',
          targetId: 'task-one',
          scenarioIds: ['create-todo'],
          stimulusStepIds: ['fill-title'],
          observationStepIds: [],
          rationale: 'The fixture exercises the task stimulus but intentionally does not assert the result.',
          state: 'deferred',
          limitation: 'Assertion coverage is outside this reference-resolution fixture.',
        },
        {
          kind: 'quality-concern',
          targetId: 'accessibility',
          scenarioIds: [],
          stimulusStepIds: [],
          observationStepIds: [],
          rationale: 'Accessibility is declared but not exercised by this fixture.',
          state: 'deferred',
          limitation: 'Covered by dedicated accessibility validation tests.',
        },
      ],
    },
    customExtensions: [],
  },
  customExtensionProposals: [],
} as const

describe('Validation AST check and preview', () => {
  it('resolves exact references and returns a deterministic bounded preview without mutation', () => {
    expect(checkValidationAst(submission, context)).toMatchObject({ valid: true, blockers: [] })
    const first = previewValidationAst(submission, context)
    const second = previewValidationAst(submission, context)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      valid: true,
      entities: [{ scenarioId: 'create-todo' }],
      actions: [{ id: 'browser.forms.fill', version: '1' }],
      locators: [{ id: 'title-input', version: '1' }],
      gherkin: [expect.stringContaining('When the user fills the title')],
      commandReceipt: {
        catalogHash: catalog.catalogHash,
        locatorGraphHash: graph.contentHash,
        contentHash: expect.stringMatching(/^sha256:/),
      },
      previewHash: expect.stringMatching(/^sha256:/),
    })
    const compiled = compileValidationAstNode(
      submission.ast,
      [
        {
          refId: 'title-input',
          moduleId: 'todo-module',
          id: 'title-input',
          name: 'Title',
          value: '[name="title"]',
          groupId: 'form-fields',
          groupName: 'Fields',
          route: '/',
        },
      ],
      context.planScope,
    )
    expect(compiled.testCaseIds).toEqual(first.entities.map(entity => entity.caseId))
    expect(compiled.appraiseArtifacts.testCases[0]!.steps.map(step => step.id)).toEqual(first.entities[0]!.stepIds)
    expect(compiled.appraiseArtifacts.testCases[0]!.steps.map(step => step.gherkinStep).join('\n')).toBe(
      first.gherkin[0]!.split('\n')
        .slice(1)
        .map(line => line.trim())
        .join('\n'),
    )
  })

  it('accepts a persistent locator id as an alias for its AST graph reference', () => {
    const aliased = structuredClone(submission) as unknown as ValidationAstSubmission
    const target = aliased.ast.scenarios[0]!.steps[0]!.action.inputs.target as { id: string }
    target.id = 'title-input-row'

    expect(checkValidationAst(aliased, context)).toMatchObject({ valid: true, blockers: [] })
    expect(previewValidationAst(aliased, context).locators).toEqual([expect.objectContaining({ id: 'title-input' })])
  })

  it('scopes canonical entity IDs so identical ASTs in different plans cannot collide', () => {
    const first = previewValidationAst(submission, context)
    const second = previewValidationAst(submission, { ...context, planScope: `${hash('p')}:plan-two` })
    expect(second.entities[0]!.caseId).not.toBe(first.entities[0]!.caseId)
    expect(second.entities[0]!.stepIds).not.toEqual(first.entities[0]!.stepIds)
  })

  it('warns when claimed persistence is observed before reload or after deleting the same entity', () => {
    const persistenceSubmission = structuredClone(submission) as unknown as ValidationAstSubmission
    persistenceSubmission.ast.qualityConcerns = ['persistence']
    persistenceSubmission.ast.scenarios[0]!.steps = [
      {
        id: 'delete-bread',
        keyword: 'When',
        description: 'the user deletes Bread',
        action: {
          id: 'browser.forms.fill',
          version: '1',
          inputs: { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Bread' },
        },
      },
      {
        id: 'observe-bread',
        keyword: 'Then',
        description: 'Bread should retain its purchased state',
        action: {
          id: 'browser.forms.fill',
          version: '1',
          inputs: { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Bread' },
        },
      },
    ]
    persistenceSubmission.ast.coverageArgument = {
      mappings: [
        {
          kind: 'task',
          targetId: 'task-one',
          scenarioIds: ['create-todo'],
          stimulusStepIds: ['delete-bread'],
          observationStepIds: ['observe-bread'],
          rationale: 'Exercises the task.',
          state: 'covered',
        },
        {
          kind: 'quality-concern',
          targetId: 'persistence',
          scenarioIds: ['create-todo'],
          stimulusStepIds: ['delete-bread'],
          observationStepIds: ['observe-bread'],
          rationale: 'Claims the Bread state survives reload.',
          state: 'covered',
        },
      ],
    }

    expect(checkValidationAst(persistenceSubmission, context).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'semantic-persistence-observation-before-reload' }),
        expect.objectContaining({ code: 'semantic-persistence-target-destroyed', referenceId: 'delete-bread' }),
      ]),
    )

    const unrelatedOpaqueLocators = structuredClone(persistenceSubmission)
    unrelatedOpaqueLocators.ast.scenarios[0]!.steps[0]!.action.inputs = {
      target: { ref: 'locator', id: 'locator_apr-12fd248e34355b56e2a60a13', version: '1' },
      value: 'Bread',
    }
    unrelatedOpaqueLocators.ast.scenarios[0]!.steps[1]!.description = 'Milk should retain its purchased state'
    unrelatedOpaqueLocators.ast.scenarios[0]!.steps[1]!.action.inputs = {
      target: { ref: 'locator', id: 'locator_apr-42344f112428bbecd2bc9567', version: '1' },
      value: 'Milk',
    }

    expect(checkValidationAst(unrelatedOpaqueLocators, context).warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'semantic-persistence-target-destroyed' })]),
    )
  })

  it('does not treat clearing a search field as destroying persisted entities', () => {
    const persistenceSubmission = structuredClone(submission) as unknown as ValidationAstSubmission
    persistenceSubmission.ast.qualityConcerns = ['persistence']
    persistenceSubmission.ast.scenarios[0]!.steps = [
      {
        id: 'reload-notes',
        keyword: 'When',
        description: 'the user reloads the notes app',
        action: { id: 'browser.navigation.reload', version: '1', inputs: {} },
      },
      {
        id: 'clear-note-search',
        keyword: 'And',
        description: 'the user clears the note search field',
        action: {
          id: 'browser.forms.fill',
          version: '1',
          inputs: { target: { ref: 'locator', id: 'title-input', version: '1' }, value: '' },
        },
      },
      {
        id: 'observe-note',
        keyword: 'Then',
        description: 'the persisted note remains visible',
        action: {
          id: 'browser.assertions.text',
          version: '1',
          inputs: { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Bread' },
        },
      },
    ]
    persistenceSubmission.ast.coverageArgument = {
      mappings: [
        {
          kind: 'quality-concern',
          targetId: 'persistence',
          scenarioIds: ['create-todo'],
          stimulusStepIds: ['reload-notes'],
          observationStepIds: ['observe-note'],
          rationale: 'Claims the note survives reload.',
          state: 'covered',
        },
      ],
    }

    expect(checkValidationAst(persistenceSubmission, context).warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'semantic-persistence-target-destroyed' })]),
    )

    persistenceSubmission.ast.scenarios[0]!.steps[1]!.description = 'the user clears all persisted notes'
    expect(checkValidationAst(persistenceSubmission, context).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'semantic-persistence-target-destroyed', referenceId: 'clear-note-search' }),
      ]),
    )
  })

  it('projects expected-red last-passing references to stable executable step ids', () => {
    const expectedRedSubmission = {
      ...submission,
      ast: {
        ...submission.ast,
        expectedFailures: [
          {
            browser: 'chromium' as const,
            environmentId: 'local',
            signature: 'AssertionError',
            order: 0,
            lastPassingStepId: 'fill-title',
          },
        ],
      },
    }
    const preview = previewValidationAst(expectedRedSubmission, context)
    const compiled = compileValidationAstNode(
      expectedRedSubmission.ast,
      [
        {
          refId: 'title-input',
          moduleId: 'todo-module',
          id: 'title-input',
          name: 'Title',
          value: '[name="title"]',
          groupId: 'form-fields',
          groupName: 'Fields',
          route: '/',
        },
      ],
      context.planScope,
    )

    expect(compiled.expectedFailures[0]!.lastPassingStepId).toBe(preview.entities[0]!.stepIds[0])
    expect(compiled.expectedFailures[0]!.lastPassingStepId).not.toBe('fill-title')
  })

  it('returns stable blockers for stale plans, missing coverage, references, types, and runtime capabilities', () => {
    const invalid = structuredClone(submission) as unknown as {
      expectedPlanHash: string
      ast: {
        coversTaskIds: string[]
        scenarios: Array<{
          steps: Array<{ action: { inputs: { value: string | number; target: { id: string } } } }>
        }>
      }
    }
    invalid.expectedPlanHash = hash('b')
    invalid.ast.coversTaskIds = ['missing-task']
    invalid.ast.scenarios[0].steps[0].action.inputs.value = 42
    invalid.ast.scenarios[0].steps[0].action.inputs.target.id = 'missing-locator'
    const checked = checkValidationAst(invalid, { ...context, availableCapabilities: [] })
    expect(checked.valid).toBe(false)
    expect(checked.blockers.map(blocker => blocker.code)).toEqual(
      expect.arrayContaining([
        'plan-hash-stale',
        'plan-task-not-found',
        'action-input-type-mismatch',
        'locator-reference-not-found',
        'capability-unavailable',
      ]),
    )
  })

  it('blocks uncovered requirements and partial coverage without exact acknowledgement', () => {
    const incomplete = structuredClone(submission) as unknown as ValidationAstSubmission
    incomplete.ast.coverageArgument!.mappings[0]!.state = 'uncovered'
    expect(checkValidationAst(incomplete, context).blockers.map(blocker => blocker.code)).toContain(
      'coverage-uncovered',
    )
    incomplete.ast.coverageArgument!.mappings[0]!.state = 'partial'
    expect(checkValidationAst(incomplete, context).blockers.map(blocker => blocker.code)).toContain(
      'coverage-partial-acknowledgement-required',
    )
    incomplete.ast.coverageArgument!.mappings[0]!.partialAcknowledgement = 'Reviewed missing portable capability.'
    expect(checkValidationAst(incomplete, context).blockers.map(blocker => blocker.code)).not.toContain(
      'coverage-partial-acknowledgement-required',
    )
  })

  it('returns exact compiled extension reviews and deterministic security blockers', () => {
    const withExtension = structuredClone(submission) as unknown as ValidationAstSubmission
    withExtension.ast.customExtensions = ['project-assertion']
    ;(withExtension.ast.scenarios[0].steps[0].action.inputs as Record<string, unknown>).value = {
      ref: 'custom-extension',
      id: 'project-assertion',
      version: '1.0.0',
    }
    withExtension.customExtensionProposals = [
      {
        schemaVersion: 1,
        id: 'project-assertion',
        version: '1.0.0',
        title: 'Project assertion',
        description: 'Assert a project-specific condition.',
        reasonExistingActionsAreInsufficient: 'No registered action exposes this condition.',
        inputs: [],
        outputs: [],
        requiredCapabilities: ['browser'],
        implementation: { language: 'typescript', source: 'export const projectAssertion: boolean = true' },
      },
    ]
    const preview = previewValidationAst(withExtension, context)
    expect(preview.customExtensions).toEqual([
      expect.objectContaining({
        projectId: 'project-one',
        projectFingerprint: hash('p'),
        compiledHash: expect.stringMatching(/^sha256:/),
        imports: [],
      }),
    ])
    ;(withExtension.customExtensionProposals[0] as { implementation: { source: string } }).implementation.source =
      "import fs from 'node:fs'"
    const first = checkValidationAst(withExtension, context).blockers.filter(blocker =>
      blocker.code.startsWith('custom-extension'),
    )
    const second = checkValidationAst(withExtension, context).blockers.filter(blocker =>
      blocker.code.startsWith('custom-extension'),
    )
    expect(first).toEqual(second)
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'custom-extension-compilation-rejected',
          referenceId: 'project-assertion@1.0.0',
        }),
      ]),
    )
  })
})
