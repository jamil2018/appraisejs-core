import { describe, expect, it } from 'vitest'

import { createActionCatalog } from '@/lib/action-catalog'
import { createLocatorGraph } from '@/lib/locator-graph'
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
      examples: [],
      deprecated: false,
    },
  ],
})
const locator = {
  id: 'title-input',
  version: '1',
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
    schemaVersion: '1',
    id: 'todo-validation',
    title: 'Todo validation',
    purpose: 'Verify todo entry.',
    coversTaskIds: ['task-one'],
    matrix: [{ browser: 'chromium', environmentId: 'local' }],
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

  it('scopes canonical entity IDs so identical ASTs in different plans cannot collide', () => {
    const first = previewValidationAst(submission, context)
    const second = previewValidationAst(submission, { ...context, planScope: `${hash('p')}:plan-two` })
    expect(second.entities[0]!.caseId).not.toBe(first.entities[0]!.caseId)
    expect(second.entities[0]!.stepIds).not.toEqual(first.entities[0]!.stepIds)
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

  it('returns exact compiled extension reviews and deterministic security blockers', () => {
    const withExtension = structuredClone(submission) as typeof submission & {
      ast: { customExtensions: string[] }
      customExtensionProposals: unknown[]
    }
    withExtension.ast.customExtensions = ['project-assertion']
    ;(withExtension.ast.scenarios[0].steps[0].action.inputs as Record<string, unknown>).value = {
      ref: 'custom-extension',
      id: 'project-assertion',
      version: '1.0.0',
    }
    withExtension.customExtensionProposals = [
      {
        schemaVersion: '1',
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
