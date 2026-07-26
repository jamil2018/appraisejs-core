import { z } from 'zod'
import type { OperationDescriptor } from '../../../packages/cucumber-runtime/src/operations/contracts.ts'
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
type AuthoringOperation = Pick<OperationDescriptor, 'id' | 'version' | 'categories' | 'assertionConcerns' | 'inputs'>

const SIMPLE_CONCERNS = ['accessibility', 'persistence'] as const
const SIMPLE_RUNTIME_CLEANLINESS_ACTIONS = [
  'browser.assertions.no-console-errors@1',
  'browser.assertions.no-failed-network-requests@1',
] as const
const operationKey = (operation: { id: string; version: string }) => `${operation.id}@${operation.version}`
const invocationOperation = (step: ValidationAst['scenarios'][number]['steps'][number]) => step.invocation.step

function effectiveThenSteps(ast: ValidationAst) {
  return ast.scenarios.flatMap(scenario => {
    let effectiveKeyword: 'Given' | 'When' | 'Then' | undefined
    return scenario.steps.filter(step => {
      if (step.invocation.presentation?.keyword && step.invocation.presentation.keyword !== 'And')
        effectiveKeyword = step.invocation.presentation.keyword
      return effectiveKeyword === 'Then'
    })
  })
}

function assertionIssues(ast: ValidationAst, descriptors: Map<string, AuthoringOperation>): AuthoringProfileIssue[] {
  const thenSteps = effectiveThenSteps(ast)
  const assertedConcerns = new Set(
    thenSteps.flatMap(step => descriptors.get(operationKey(invocationOperation(step)))?.assertionConcerns ?? []),
  )
  const issues: AuthoringProfileIssue[] = SIMPLE_CONCERNS.filter(
    concern => !ast.qualityConcerns.includes(concern) || !assertedConcerns.has(concern),
  ).map(concern => ({
    code: 'simple-profile-assertion-concern-missing',
    message: `Simple happy-path authoring requires a registered Then assertion for the ${concern} concern.`,
    referenceId: concern,
  }))
  if (
    !thenSteps.some(step =>
      descriptors.get(operationKey(invocationOperation(step)))?.categories.includes('browser.assertions'),
    )
  )
    issues.push({
      code: 'simple-profile-assertion-missing',
      message: 'Simple happy-path authoring requires an explicit Then assertion.',
    })
  return issues
}

function timingIssues(ast: ValidationAst, descriptors: Map<string, AuthoringOperation>): AuthoringProfileIssue[] {
  return ast.scenarios.flatMap(scenario =>
    scenario.steps.flatMap(step => {
      const inputs = descriptors.get(operationKey(invocationOperation(step)))?.inputs ?? []
      const exceedsLimit = inputs.some(input => {
        const value = step.invocation.inputs[input.name]
        if (typeof value !== 'number') return false
        const unit = input.constraints?.unit
        const seconds = unit === 'milliseconds' ? value / 1_000 : value
        return seconds > 30
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
  const actionIds = new Set(effectiveThenSteps(ast).map(step => operationKey(invocationOperation(step))))
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
  operations: AuthoringOperation[],
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
  const descriptors = new Map(operations.map(operation => [operationKey(operation), operation]))
  issues.push(...assertionIssues(ast, descriptors))
  issues.push(...runtimeCleanlinessIssues(ast))
  if (!profile.advanced.timing) issues.push(...timingIssues(ast, descriptors))
  return issues
}
