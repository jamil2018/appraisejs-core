import { describe, expect, it, vi } from 'vitest'
import {
  compileCustomExtension,
  createCustomExtensionPolicy,
  validationAstHash,
  validationAstSchema,
} from '@/lib/validation-ast'
import {
  compileValidationAstNode,
  compileValidationAstToCanonicalEntities,
  PROJECT_EXTENSION_CAPABILITY_IMPORTS,
} from './validation-ast-compiler-service'
import { projectCompiledValidationArtifacts } from './validation-canonical-projection-service'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'

vi.mock('./validation-canonical-projection-service', () => ({
  projectCompiledValidationArtifacts: vi.fn().mockResolvedValue({ testCases: 1 }),
}))

function invocation(
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then',
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

const ast = {
  schemaVersion: 2,
  id: 'meditation',
  title: 'Meditation',
  purpose: 'Complete a session.',
  coversTaskIds: ['task-one'],
  matrix: [{ browser: 'chromium', environmentId: 'local' }],
  qualityConcerns: ['persistence'],
  customExtensions: [],
  scenarios: [
    {
      id: 'complete',
      title: 'Complete',
      steps: [
        {
          id: 'start',
          invocation: invocation(
            'browser.mouse.click',
            { target: { ref: 'locator', id: 'loc_start', version: '1' } },
            'When',
            'the user starts meditation',
          ),
        },
        {
          id: 'finish',
          invocation: invocation(
            'browser.assertions.visible',
            { target: { ref: 'locator', id: 'loc_start', version: '1' } },
            'Then',
            'the session is complete',
          ),
        },
      ],
    },
  ],
} as const

describe('Validation AST canonical projection compiler', () => {
  it('maps scenarios into canonical modules, suites, cases, ordered steps, identifiers, and validation node shape', () => {
    const node = compileValidationAstNode(ast, [
      {
        refId: 'loc_start',
        moduleId: 'meditation',
        id: 'start-button',
        name: 'Start button',
        value: '[data-testid="start"]',
        groupId: 'meditation-page',
        groupName: 'Meditation page',
        route: '/meditate',
      },
    ])
    expect(node).toMatchObject({
      id: 'meditation',
      taskIds: ['task-one'],
      testCaseIds: [expect.stringMatching(/^ast-[a-f0-9]{12}-complete$/)],
    })
    expect(node.appraiseArtifacts).toMatchObject({
      modules: [{ id: expect.stringMatching(/^ast-[a-f0-9]{12}-module$/) }],
      testSuites: [{ id: expect.stringMatching(/^ast-[a-f0-9]{12}-suite$/), testCaseIds: node.testCaseIds }],
    })
    expect(node.appraiseArtifacts.testCases[0]!.steps.map(step => step.order)).toEqual([0, 1])
    expect(node.appraiseArtifacts.testCases[0]!.steps[0]).toMatchObject({
      invocation: { step: { id: 'browser.mouse.click', version: '1' } },
    })
    expect(node.appraiseArtifacts.locators).toEqual([expect.objectContaining({ id: 'start-button' })])
  })

  it('rejects stale AST hashes before starting canonical projection', async () => {
    await expect(
      compileValidationAstToCanonicalEntities({
        planId: 'plan-one',
        ast,
        expectedAstHash: `sha256:${'0'.repeat(64)}`,
        validation: {} as never,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('binds reviewed extensions to the authoritative target and passes them into the canonical transaction', async () => {
    const extensionAst = structuredClone({ ...ast, customExtensions: ['observe-breathing'] })
    ;(extensionAst.scenarios[0].steps[1]!.invocation.inputs as Record<string, unknown>).extension = {
      ref: 'custom-extension',
      id: 'observe-breathing',
      version: '1.0.0',
    }
    const extension = {
      schemaVersion: 2 as const,
      id: 'observe-breathing',
      version: '1.0.0',
      title: 'Observe breathing',
      description: 'Observe the project animation.',
      reasonExistingActionsAreInsufficient: 'No reusable action exposes the animation state.',
      inputs: [],
      outputs: [{ name: 'observed', type: 'boolean' as const }],
      requiredCapabilities: ['browser'],
      implementation: {
        language: 'typescript' as const,
        source: "import { Then } from '@cucumber/cucumber'\nThen('breathing is visible', function () {})",
      },
    }
    const targetProject = { id: 'project-one', fingerprint: `sha256:${'b'.repeat(64)}` }
    const reviewed = compileCustomExtension(extension, {
      policy: createCustomExtensionPolicy({
        projectId: targetProject.id,
        projectFingerprint: targetProject.fingerprint,
        capabilityImports: PROJECT_EXTENSION_CAPABILITY_IMPORTS,
      }),
    })
    const client = {
      planProjection: { findUnique: vi.fn().mockResolvedValue({ targetProject }) },
    } as never

    const result = await compileValidationAstToCanonicalEntities(
      {
        planId: 'plan-one',
        ast: extensionAst,
        expectedAstHash: `sha256:${'placeholder'}`,
        validation: { validations: [] } as never,
        resolvedLocators: [
          {
            refId: 'loc_start',
            moduleId: 'meditation',
            id: 'start-button',
            name: 'Start button',
            value: '[data-testid="start"]',
            groupId: 'meditation-page',
            groupName: 'Meditation page',
            route: '/meditate',
          },
        ],
        customExtensionProposals: [extension],
        expectedCompiledExtensionHashes: { 'observe-breathing@1.0.0': reviewed.compiledHash },
      },
      client,
    ).catch(error => error)
    expect(result).toMatchObject({ code: 'CONFLICT' })

    const astHash = validationAstHash(validationAstSchema.parse(extensionAst))
    await compileValidationAstToCanonicalEntities(
      {
        planId: 'plan-one',
        ast: extensionAst,
        expectedAstHash: astHash,
        validation: { validations: [] } as never,
        resolvedLocators: [
          {
            refId: 'loc_start',
            moduleId: 'meditation',
            id: 'start-button',
            name: 'Start button',
            value: '[data-testid="start"]',
            groupId: 'meditation-page',
            groupName: 'Meditation page',
            route: '/meditate',
          },
        ],
        customExtensionProposals: [extension],
        expectedCompiledExtensionHashes: { 'observe-breathing@1.0.0': reviewed.compiledHash },
      },
      client,
    )
    expect(projectCompiledValidationArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        compiledExtensions: [
          expect.objectContaining({ projectId: 'project-one', compiledHash: reviewed.compiledHash }),
        ],
      }),
      client,
    )
  })
})
