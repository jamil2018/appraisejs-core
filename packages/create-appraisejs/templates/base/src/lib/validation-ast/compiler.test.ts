import { describe, expect, it } from 'vitest'

import { createLocatorGraph } from '@/lib/locator-graph'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import type { ValidationAstSubmission } from '@/lib/validation-ast'
import { compileValidationAstNode } from '@/services/coordinator/validation-ast-compiler-service'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { checkValidationAst, previewValidationAst, type ValidationAstCompilerContext } from './compiler'
import { createCustomExtensionPolicy } from './extension-policy'

const hash = (character: string) => `sha256:${character.repeat(64)}`
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
const stepDefinitions = new Map(
  builtInStepDefinitions.map(
    definition =>
      [
        `${definition.identity.id}@${definition.identity.version}`,
        { definition, definitionHash: computeStepReferenceHash(definition), receiptHash: '' },
      ] as const,
  ),
)
const context: ValidationAstCompilerContext = {
  project: { id: 'project-one', fingerprint: hash('p') },
  planScope: `${hash('p')}:plan-one`,
  currentPlanHash: hash('a'),
  planTaskIds: ['task-one'],
  operationRegistry: defaultOperationRegistry,
  stepDefinitions,
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
function invocation(
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then' | 'And',
  description: string,
) {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
  return {
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs,
    presentation: { keyword, description },
  }
}
const submission = {
  expectedPlanHash: hash('a'),
  ast: {
    schemaVersion: 2,
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
            invocation: invocation(
              'browser.forms.fill',
              { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Meditate' },
              'When',
              'the user fills the title',
            ),
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
          rationale: 'The fixture exercises the task stimulus.',
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
const bindings = [
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
]

describe('Validation AST check and preview', () => {
  it('resolves content-addressed StepInvocation references and deterministically projects canonical artifacts', () => {
    expect(checkValidationAst(submission, context)).toMatchObject({ valid: true, blockers: [] })
    const first = previewValidationAst(submission, context)
    expect(first).toEqual(previewValidationAst(submission, context))
    expect(first).toMatchObject({
      valid: true,
      entities: [{ scenarioId: 'create-todo' }],
      operations: [{ id: 'browser.forms.fill', version: '1' }],
      locators: [{ id: 'title-input', version: '1' }],
      gherkin: [expect.stringContaining('When the user fills the title')],
    })
    const compiled = compileValidationAstNode(submission.ast, bindings, context.planScope)
    expect(compiled.testCaseIds).toEqual(first.entities.map(entity => entity.caseId))
    expect(compiled.appraiseArtifacts.testCases[0]!.steps[0]!.invocation).toMatchObject(
      submission.ast.scenarios[0]!.steps[0]!.invocation,
    )
  })

  it('rejects stale or unregistered exact StepInvocation references', () => {
    const stale = structuredClone(submission) as unknown as ValidationAstSubmission
    stale.ast.scenarios[0]!.steps[0]!.invocation.step.definitionHash = hash('f')
    expect(checkValidationAst(stale, context).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'step-reference-stale' })]),
    )
    stale.ast.scenarios[0]!.steps[0]!.invocation.step.id = 'browser.unknown'
    expect(checkValidationAst(stale, context).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'step-reference-not-found' })]),
    )
  })

  it('preserves semantic validation over invocation presentation and inputs', () => {
    const persistence = structuredClone(submission) as unknown as ValidationAstSubmission
    persistence.ast.qualityConcerns = ['persistence']
    persistence.ast.scenarios[0]!.steps = [
      {
        id: 'delete-bread',
        invocation: invocation(
          'browser.forms.fill',
          { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Bread' },
          'When',
          'the user deletes Bread',
        ),
      },
      {
        id: 'observe-bread',
        invocation: invocation(
          'browser.forms.fill',
          { target: { ref: 'locator', id: 'title-input', version: '1' }, value: 'Bread' },
          'Then',
          'Bread should retain its purchased state',
        ),
      },
    ]
    persistence.ast.coverageArgument = {
      mappings: [
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
    expect(checkValidationAst(persistence, context).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'semantic-persistence-observation-before-reload' }),
        expect.objectContaining({ code: 'semantic-persistence-target-destroyed', referenceId: 'delete-bread' }),
      ]),
    )
  })

  it('returns stable blockers for stale plans, input types, locators, capability and coverage', () => {
    const invalid = structuredClone(submission) as unknown as ValidationAstSubmission
    invalid.expectedPlanHash = hash('b')
    invalid.ast.coversTaskIds = ['missing-task']
    invalid.ast.scenarios[0]!.steps[0]!.invocation.inputs.value = 42
    invalid.ast.scenarios[0]!.steps[0]!.invocation.inputs.target = {
      ref: 'locator',
      id: 'missing-locator',
      version: '1',
    }
    invalid.ast.coverageArgument!.mappings[0]!.state = 'uncovered'
    expect(
      checkValidationAst(invalid, { ...context, availableCapabilities: [] }).blockers.map(blocker => blocker.code),
    ).toEqual(
      expect.arrayContaining([
        'plan-hash-stale',
        'plan-task-not-found',
        'step-input-type-mismatch',
        'locator-reference-not-found',
        'capability-unavailable',
        'coverage-uncovered',
      ]),
    )
  })

  it('returns exact compiled extension reviews and deterministic security blockers', () => {
    const withExtension = structuredClone(submission) as unknown as ValidationAstSubmission
    withExtension.ast.customExtensions = ['project-assertion']
    withExtension.customExtensionProposals = [
      {
        schemaVersion: 2,
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
    expect(previewValidationAst(withExtension, context).customExtensions).toEqual([
      expect.objectContaining({ projectId: 'project-one', compiledHash: expect.stringMatching(/^sha256:/) }),
    ])
    withExtension.customExtensionProposals[0]!.implementation.source = "import fs from 'node:fs'"
    expect(checkValidationAst(withExtension, context).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'custom-extension-compilation-rejected',
          referenceId: 'project-assertion@1.0.0',
        }),
      ]),
    )
  })
})
