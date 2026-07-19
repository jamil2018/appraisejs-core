import { z } from 'zod'
import type { ActionDescriptor } from '@/lib/action-catalog'
import type { ValidationAst } from './schemas'

export const SIMPLE_HAPPY_PATH_PROFILE_ID = 'simple-happy-path' as const
export const validationAstAuthoringProfileSchema = z.object({
  id: z.literal(SIMPLE_HAPPY_PATH_PROFILE_ID),
  version: z.literal('1'),
  advanced: z
    .object({ matrix: z.boolean().default(false), timing: z.boolean().default(false) })
    .default({ matrix: false, timing: false }),
})

export type ValidationAstAuthoringProfile = z.infer<typeof validationAstAuthoringProfileSchema>
export type AuthoringProfileIssue = { code: string; message: string; referenceId?: string }

const SIMPLE_CONCERNS = ['accessibility', 'persistence'] as const
const SIMPLE_RUNTIME_CLEANLINESS_ACTIONS = [
  'browser.assertions.no-console-errors@1',
  'browser.assertions.no-failed-network-requests@1',
] as const
const actionKey = (action: { id: string; version: string }) => `${action.id}@${action.version}`

function effectiveThenSteps(ast: ValidationAst) {
  return ast.scenarios.flatMap(scenario => {
    let effectiveKeyword: 'Given' | 'When' | 'Then' | undefined
    return scenario.steps.filter(step => {
      if (step.keyword !== 'And') effectiveKeyword = step.keyword
      return effectiveKeyword === 'Then'
    })
  })
}

function assertionIssues(ast: ValidationAst, descriptors: Map<string, ActionDescriptor>): AuthoringProfileIssue[] {
  const thenSteps = effectiveThenSteps(ast)
  const assertedConcerns = new Set(
    thenSteps.flatMap(step => descriptors.get(actionKey(step.action))?.assertionConcerns ?? []),
  )
  const issues: AuthoringProfileIssue[] = SIMPLE_CONCERNS.filter(
    concern => !ast.qualityConcerns.includes(concern) || !assertedConcerns.has(concern),
  ).map(concern => ({
    code: 'simple-profile-assertion-concern-missing',
    message: `Simple happy-path authoring requires a registered Then assertion for the ${concern} concern.`,
    referenceId: concern,
  }))
  if (!thenSteps.some(step => descriptors.get(actionKey(step.action))?.categories.includes('browser.assertions')))
    issues.push({
      code: 'simple-profile-assertion-missing',
      message: 'Simple happy-path authoring requires an explicit Then assertion.',
    })
  return issues
}

function timingIssues(ast: ValidationAst, descriptors: Map<string, ActionDescriptor>): AuthoringProfileIssue[] {
  return ast.scenarios.flatMap(scenario =>
    scenario.steps.flatMap(step => {
      const inputs = descriptors.get(actionKey(step.action))?.inputs ?? []
      const exceedsLimit = inputs.some(input => {
        const value = step.action.inputs[input.name]
        if (typeof value !== 'number' || !input.numeric) return false
        return (input.numeric.unit === 'milliseconds' ? value / 1_000 : value) > 30
      })
      return exceedsLimit
        ? [
            {
              code: 'simple-profile-wait-out-of-bounds',
              message: 'Simple happy-path waits must not exceed 30 seconds unless advanced timing is enabled.',
              referenceId: step.id,
            },
          ]
        : []
    }),
  )
}

function runtimeCleanlinessIssues(ast: ValidationAst): AuthoringProfileIssue[] {
  const actionIds = new Set(effectiveThenSteps(ast).map(step => actionKey(step.action)))
  return SIMPLE_RUNTIME_CLEANLINESS_ACTIONS.filter(requiredAction => !actionIds.has(requiredAction)).map(
    requiredAction => ({
      code: 'simple-profile-runtime-cleanliness-missing',
      message: `Simple happy-path authoring requires ${requiredAction} as explicit completion evidence.`,
      referenceId: requiredAction,
    }),
  )
}

export function checkValidationAstAuthoringProfile(
  ast: ValidationAst,
  profile: ValidationAstAuthoringProfile,
  actions: ActionDescriptor[],
): AuthoringProfileIssue[] {
  const issues: AuthoringProfileIssue[] = []
  if (ast.scenarios.length !== 1)
    issues.push({
      code: 'simple-profile-scenario-count',
      message: 'Simple happy-path authoring requires one primary scenario.',
    })
  if (!profile.advanced.matrix && ast.matrix.length !== 1)
    issues.push({
      code: 'simple-profile-matrix-count',
      message:
        'Simple happy-path authoring requires one environment/browser matrix entry unless advanced matrix is enabled.',
    })
  const descriptors = new Map(actions.map(action => [actionKey(action), action]))
  issues.push(...assertionIssues(ast, descriptors))
  issues.push(...runtimeCleanlinessIssues(ast))
  if (!profile.advanced.timing) issues.push(...timingIssues(ast, descriptors))
  return issues
}
