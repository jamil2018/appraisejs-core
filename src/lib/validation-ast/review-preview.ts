import type { ValidationAst, ValidationAstSubmission } from './schemas'
import type { ValidationAstIssue } from './compiler'

const boundedText = (value: string) => (value.length > 240 ? `${value.slice(0, 237)}...` : value)

export type ValidationAstReviewPreview = {
  schemaVersion: 1
  astId: string
  title: string
  purpose: string
  valid: boolean
  previewHash: string
  receiptHash: string
  warnings: ValidationAstIssue[]
  blockers: ValidationAstIssue[]
  scenarios: Array<{
    id: string
    title: string
    steps: Array<{ id: string; keyword: string; description: string; actionId: string }>
  }>
  coverage: Array<{
    kind: string
    targetId: string
    state: string
    scenarioIds: string[]
    observationStepIds: string[]
  }>
}

export function buildValidationAstReviewPreview(input: {
  submission: ValidationAstSubmission
  valid: boolean
  previewHash: string
  receiptHash: string
  warnings: ValidationAstIssue[]
  blockers: ValidationAstIssue[]
}): ValidationAstReviewPreview {
  const ast: ValidationAst = input.submission.ast
  return {
    schemaVersion: 1,
    astId: ast.id,
    title: boundedText(ast.title),
    purpose: boundedText(ast.purpose),
    valid: input.valid,
    previewHash: input.previewHash,
    receiptHash: input.receiptHash,
    warnings: input.warnings.slice(0, 20).map(warning => ({ ...warning, message: boundedText(warning.message) })),
    blockers: input.blockers.slice(0, 20).map(blocker => ({ ...blocker, message: boundedText(blocker.message) })),
    scenarios: ast.scenarios.map(scenario => ({
      id: scenario.id,
      title: boundedText(scenario.title),
      steps: scenario.steps.map(step => ({
        id: step.id,
        keyword: step.keyword,
        description: boundedText(step.description),
        actionId: `${step.operation.id}@${step.operation.version}`,
      })),
    })),
    coverage: (ast.coverageArgument?.mappings ?? []).map(mapping => ({
      kind: mapping.kind,
      targetId: mapping.targetId,
      state: mapping.state,
      scenarioIds: mapping.scenarioIds,
      observationStepIds: mapping.observationStepIds,
    })),
  }
}

export function parseValidationAstReviewPreview(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<ValidationAstReviewPreview>
    return parsed.schemaVersion === 1 && typeof parsed.astId === 'string' && Array.isArray(parsed.scenarios)
      ? (parsed as ValidationAstReviewPreview)
      : undefined
  } catch {
    return undefined
  }
}
