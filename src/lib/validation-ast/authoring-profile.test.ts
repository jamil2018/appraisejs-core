import { describe, expect, it } from 'vitest'
import { defaultActionCatalog } from '@/lib/action-catalog'
import { checkValidationAstAuthoringProfile, validationAstAuthoringProfileSchema } from './authoring-profile'
import { validationAstSchema } from './schemas'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'

function step(
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then' | 'And',
  description: string,
) {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
  return {
    invocation: {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs,
      presentation: { keyword, description },
    },
  }
}

const ast = validationAstSchema.parse({
  schemaVersion: 2,
  id: 'simple-flow',
  title: 'Simple flow',
  purpose: 'Verify the happy path.',
  coversTaskIds: ['task-one'],
  matrix: [{ browser: 'chromium', environmentId: 'local' }],
  scenarios: [
    {
      id: 'primary',
      title: 'Primary flow',
      steps: [
        { id: 'open', ...step('browser.navigation.goto', { url: '/' }, 'When', 'the user opens the app') },
        {
          id: 'assert-accessible',
          ...step('browser.assertions.accessible', { target: 'result' }, 'Then', 'the result is accessible'),
        },
        {
          id: 'assert-persisted',
          ...step('browser.assertions.persisted', { target: 'result' }, 'Then', 'the result is persisted'),
        },
        {
          id: 'assert-console-clean',
          ...step('browser.assertions.no-console-errors', {}, 'And', 'the browser has no runtime errors'),
        },
        {
          id: 'assert-network-clean',
          ...step(
            'browser.assertions.no-failed-network-requests',
            {},
            'And',
            'the browser has no failed network activity',
          ),
        },
      ],
    },
  ],
  qualityConcerns: ['accessibility', 'persistence'],
  customExtensions: [],
})
const profile = validationAstAuthoringProfileSchema.parse({ id: 'simple-happy-path', version: '1' })
const actions = defaultActionCatalog.readActions(
  ast.scenarios[0]!.steps.map(item => ({ id: item.invocation.step.id, version: item.invocation.step.version })),
)

describe('simple happy-path authoring profile', () => {
  it('accepts one primary scenario, one matrix entry, essential concerns, and an assertion', () => {
    expect(checkValidationAstAuthoringProfile(ast, profile, actions)).toEqual([])
  })

  it('treats And steps after Then as assertions using effective Gherkin semantics', () => {
    const inheritedThenAst = structuredClone(ast)
    inheritedThenAst.scenarios[0]!.steps[2]!.invocation.presentation!.keyword = 'And'

    expect(checkValidationAstAuthoringProfile(inheritedThenAst, profile, actions)).toEqual([])
  })

  it('requires runtime cleanliness checks to be observations, not setup steps', () => {
    const setupOnlyAst = structuredClone(ast)
    setupOnlyAst.scenarios[0]!.steps[3]!.invocation.presentation!.keyword = 'When'
    setupOnlyAst.scenarios[0]!.steps[4]!.invocation.presentation!.keyword = 'And'

    expect(checkValidationAstAuthoringProfile(setupOnlyAst, profile, actions).map(issue => issue.referenceId)).toEqual([
      'browser.assertions.no-console-errors@1',
      'browser.assertions.no-failed-network-requests@1',
    ])
  })

  it('returns stable blockers and permits explicit advanced matrix/timing opt-in', () => {
    const advancedAst = structuredClone(ast)
    advancedAst.matrix.push({ browser: 'firefox', environmentId: 'local' })
    advancedAst.scenarios[0]!.steps.push({
      id: 'wait',
      ...step('browser.waits.duration', { duration: 60 }, 'And', 'the user waits'),
    })
    const advancedActions = defaultActionCatalog.readActions(
      advancedAst.scenarios[0]!.steps.map(item => ({
        id: item.invocation.step.id,
        version: item.invocation.step.version,
      })),
    )
    expect(checkValidationAstAuthoringProfile(advancedAst, profile, advancedActions).map(issue => issue.code)).toEqual([
      'simple-profile-matrix-count',
      'simple-profile-wait-out-of-bounds',
    ])
    const advanced = validationAstAuthoringProfileSchema.parse({
      id: 'simple-happy-path',
      version: '1',
      advanced: { matrix: true, timing: true },
    })
    expect(checkValidationAstAuthoringProfile(advancedAst, advanced, advancedActions)).toEqual([])
  })

  it('cannot be bypassed by assertion-like IDs, concern labels, or millisecond timing', () => {
    const bypass = structuredClone(ast)
    bypass.scenarios[0]!.steps = [
      bypass.scenarios[0]!.steps[0]!,
      {
        id: 'fake-assertion',
        ...step('browser.assertions.visible', { target: 'result' }, 'Then', 'the result appears asserted'),
      },
      {
        id: 'millisecond-wait',
        ...step('browser.waits.timeout', { timeout: 30_001 }, 'And', 'the user waits too long'),
      },
    ]
    const bypassActions = defaultActionCatalog.readActions(
      bypass.scenarios[0]!.steps.map(item => ({ id: item.invocation.step.id, version: item.invocation.step.version })),
    )
    expect(checkValidationAstAuthoringProfile(bypass, profile, bypassActions).map(issue => issue.code)).toEqual([
      'simple-profile-assertion-concern-missing',
      'simple-profile-assertion-concern-missing',
      'simple-profile-runtime-cleanliness-missing',
      'simple-profile-runtime-cleanliness-missing',
      'simple-profile-wait-out-of-bounds',
    ])
  })
})
