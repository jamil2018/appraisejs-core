import { describe, expect, it } from 'vitest'
import { defaultActionCatalog } from '@/lib/action-catalog'
import { checkValidationAstAuthoringProfile, validationAstAuthoringProfileSchema } from './authoring-profile'
import { validationAstSchema } from './schemas'

const ast = validationAstSchema.parse({
  schemaVersion: 1,
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
        {
          id: 'open',
          keyword: 'When',
          description: 'the user opens the app',
          operation: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
        },
        {
          id: 'assert-accessible',
          keyword: 'Then',
          description: 'the result is accessible',
          operation: { id: 'browser.assertions.accessible', version: '1', inputs: { target: 'result' } },
        },
        {
          id: 'assert-persisted',
          keyword: 'Then',
          description: 'the result is persisted',
          operation: { id: 'browser.assertions.persisted', version: '1', inputs: { target: 'result' } },
        },
        {
          id: 'assert-console-clean',
          keyword: 'And',
          description: 'the browser has no runtime errors',
          operation: { id: 'browser.assertions.no-console-errors', version: '1', inputs: {} },
        },
        {
          id: 'assert-network-clean',
          keyword: 'And',
          description: 'the browser has no failed network activity',
          operation: { id: 'browser.assertions.no-failed-network-requests', version: '1', inputs: {} },
        },
      ],
    },
  ],
  qualityConcerns: ['accessibility', 'persistence'],
  customExtensions: [],
})
const profile = validationAstAuthoringProfileSchema.parse({ id: 'simple-happy-path', version: '1' })
const actions = defaultActionCatalog.readActions(
  ast.scenarios[0]!.steps.map(step => ({ id: step.operation.id, version: step.operation.version })),
)

describe('simple happy-path authoring profile', () => {
  it('accepts one primary scenario, one matrix entry, essential concerns, and an assertion', () => {
    expect(checkValidationAstAuthoringProfile(ast, profile, actions)).toEqual([])
  })

  it('treats And steps after Then as assertions using effective Gherkin semantics', () => {
    const inheritedThenAst = structuredClone(ast)
    inheritedThenAst.scenarios[0]!.steps[2]!.keyword = 'And'

    expect(checkValidationAstAuthoringProfile(inheritedThenAst, profile, actions)).toEqual([])
  })

  it('requires runtime cleanliness checks to be observations, not setup steps', () => {
    const setupOnlyAst = structuredClone(ast)
    setupOnlyAst.scenarios[0]!.steps[3]!.keyword = 'When'
    setupOnlyAst.scenarios[0]!.steps[4]!.keyword = 'And'

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
      keyword: 'And',
      description: 'the user waits',
      operation: { id: 'browser.waits.duration', version: '1', inputs: { duration: 60 } },
    })
    const advancedActions = defaultActionCatalog.readActions(
      advancedAst.scenarios[0]!.steps.map(step => ({ id: step.operation.id, version: step.operation.version })),
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
        keyword: 'Then',
        description: 'the result appears asserted',
        operation: { id: 'browser.assertions.visible', version: '1', inputs: { target: 'result' } },
      },
      {
        id: 'millisecond-wait',
        keyword: 'And',
        description: 'the user waits too long',
        operation: { id: 'browser.waits.timeout', version: '1', inputs: { timeout: 30_001 } },
      },
    ]
    const bypassActions = defaultActionCatalog.readActions(
      bypass.scenarios[0]!.steps.map(step => ({ id: step.operation.id, version: step.operation.version })),
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
