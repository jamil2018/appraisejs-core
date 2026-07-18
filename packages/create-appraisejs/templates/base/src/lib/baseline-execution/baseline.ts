import { createHash } from 'node:crypto'

import type { ValidationArtifact } from '@/lib/plan-contract'
import type { TestRunEvidenceHealthValue } from '@/services/test-run/run-evidence-summary-service'

export type BaselineClassification =
  | 'expected_product_failure'
  | 'unexpected_pass'
  | 'unrelated_existing_failure'
  | 'authoring_failure'
  | 'infrastructure_failure'

export type BaselineEvidence = {
  result: 'passed' | 'failed' | 'cancelled' | 'interrupted'
  evidenceHealth?: TestRunEvidenceHealthValue
  blockers?: string[]
  failureSignatures: string[]
  completedStepIds: string[]
}

export type BaselineCombination = {
  validationId: string
  browser: string
  environment: string
}

type CucumberStep = {
  name?: string
  keyword?: string
  result?: { status?: string; error_message?: string }
}

export function extractCucumberEvidence(
  report: unknown,
): Pick<BaselineEvidence, 'failureSignatures' | 'completedStepIds'> {
  if (!Array.isArray(report)) return { failureSignatures: [], completedStepIds: [] }
  const steps = report.flatMap(feature =>
    Array.isArray(feature?.elements)
      ? feature.elements.flatMap((scenario: { steps?: CucumberStep[] }) =>
          Array.isArray(scenario.steps) ? scenario.steps : [],
        )
      : [],
  ) as CucumberStep[]
  return {
    failureSignatures: steps
      .filter(step => step.result?.status === 'failed' && step.result.error_message)
      .map(step => step.result!.error_message!.trim().split(/\r?\n/, 1)[0]!),
    completedStepIds: steps
      .filter(step => step.result?.status === 'passed')
      .flatMap(step => [step.name?.trim(), `${step.keyword ?? ''}${step.name ?? ''}`.trim()])
      .filter((value): value is string => Boolean(value)),
  }
}

export function requiredBaselineCombinations(validation: ValidationArtifact): BaselineCombination[] {
  return validation.validations
    .filter(item => item.required)
    .flatMap(item =>
      item.matrix.map(combination => ({
        validationId: item.id,
        browser: combination.browser,
        environment: combination.environment,
      })),
    )
}

export function baselineCombinationKey(combination: BaselineCombination): string {
  return `${combination.validationId}:${combination.browser}:${combination.environment}`
}

function completedExecutableStepIds(validation: ValidationArtifact['validations'][number], evidence: BaselineEvidence) {
  const completed = new Set(evidence.completedStepIds)
  for (const testCase of validation.appraiseArtifacts.testCases)
    for (const step of testCase.steps)
      if (completed.has(step.label) || completed.has(step.gherkinStep)) completed.add(step.id)
  return completed
}

export function classifyBaselineResult(
  validation: ValidationArtifact['validations'][number],
  combination: BaselineCombination,
  evidence: BaselineEvidence,
): { classification: BaselineClassification; signatureHash: string; reason: string } {
  const expected = validation.expectedFailures
    .filter(item => item.browser === combination.browser && item.environment === combination.environment)
    .sort((left, right) => left.order - right.order)
  const signatureHash = hashFailureSignatures(evidence.failureSignatures)

  if (evidence.evidenceHealth && evidence.evidenceHealth !== 'valid') {
    return {
      classification:
        evidence.evidenceHealth === 'infrastructure_failure' ? 'infrastructure_failure' : 'authoring_failure',
      signatureHash,
      reason:
        evidence.evidenceHealth === 'infrastructure_failure'
          ? 'Managed baseline infrastructure failed and the validation runtime must be repaired before retrying.'
          : `Managed baseline evidence is not trustworthy (${evidence.evidenceHealth}) and the validation runtime must be repaired before retrying.`,
    }
  }

  if (evidence.result === 'passed') {
    return {
      classification: 'unexpected_pass',
      signatureHash,
      reason: 'The validation already passes and requires explicit regression-coverage justification.',
    }
  }
  if (evidence.result !== 'failed') {
    return {
      classification: 'infrastructure_failure',
      signatureHash,
      reason: `The run ended as ${evidence.result}.`,
    }
  }
  if (evidence.failureSignatures.some(signature => isBlockingFailure(signature))) {
    return {
      classification: 'authoring_failure',
      signatureHash,
      reason:
        'The run contains a validation harness failure such as an undefined step, failed import, missing setup, or timeout.',
    }
  }
  const lastExpectedStep = expected.at(-1)?.lastPassingStepId
  if (lastExpectedStep && !completedExecutableStepIds(validation, evidence).has(lastExpectedStep)) {
    return {
      classification: 'authoring_failure',
      signatureHash,
      reason: `Required setup step "${lastExpectedStep}" did not pass before the failure.`,
    }
  }
  const orderedMatch = matchesApprovedFailureSequence(
    expected.map(item => item.signature),
    evidence.failureSignatures,
  )
  if (orderedMatch) {
    return {
      classification: 'expected_product_failure',
      signatureHash,
      reason: 'Observed failures match the approved ordered signatures.',
    }
  }
  return {
    classification: 'unrelated_existing_failure',
    signatureHash,
    reason: 'The failure is outside the approved expected signatures and requires acknowledgement.',
  }
}

function matchesApprovedFailureSequence(expected: string[], observed: string[]): boolean {
  if (expected.length === 0 || observed.length === 0) return false
  if (!observed[0]!.includes(expected[0]!)) return false
  let expectedIndex = 0
  for (const signature of observed.slice(1)) {
    if (signature.includes(expected[expectedIndex]!)) continue
    const nextIndex = expectedIndex + 1
    if (nextIndex >= expected.length || !signature.includes(expected[nextIndex]!)) return false
    expectedIndex = nextIndex
  }
  return expectedIndex === expected.length - 1
}

export function hashFailureSignatures(signatures: string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(signatures)).digest('hex')}`
}

export function assessBaselineAcceptance(validation: ValidationArtifact): { ready: boolean; blockers: string[] } {
  const attemptsByCombination = new Map<string, ValidationArtifact['baselineAttempts']>()
  for (const attempt of validation.baselineAttempts) {
    const key = baselineCombinationKey(attempt)
    attemptsByCombination.set(key, [...(attemptsByCombination.get(key) ?? []), attempt])
  }
  const blockers = requiredBaselineCombinations(validation).flatMap(combination =>
    baselineCombinationBlockers(
      validation,
      combination,
      attemptsByCombination.get(baselineCombinationKey(combination)),
    ),
  )
  return { ready: blockers.length === 0, blockers }
}

function baselineCombinationBlockers(
  validation: ValidationArtifact,
  combination: BaselineCombination,
  attempts: ValidationArtifact['baselineAttempts'] = [],
): string[] {
  const key = baselineCombinationKey(combination)
  const latest = attempts.at(-1)
  if (!latest || latest.status !== 'completed') return [`${key} has no completed baseline.`]
  if (latest.classification === 'authoring_failure') {
    return [`${key} has a validation authoring failure that must be remediated in validation review.`]
  }
  if (latest.classification === 'infrastructure_failure') {
    return [`${key} has a baseline infrastructure failure that must be repaired before retrying.`]
  }
  if (latest.classification === 'unexpected_pass' && !latest.regressionJustification?.trim()) {
    return [`${key} needs regression-coverage justification.`]
  }
  return hasRequiredBaselineAcknowledgement(validation, latest)
    ? []
    : [`${key} needs exact baseline-failure acknowledgement.`]
}

function hasRequiredBaselineAcknowledgement(
  validation: ValidationArtifact,
  attempt: ValidationArtifact['baselineAttempts'][number],
) {
  if (!['expected_product_failure', 'unrelated_existing_failure'].includes(attempt.classification ?? '')) return true
  return validation.baselineAcknowledgements.some(
    acknowledgement =>
      acknowledgement.attemptId === attempt.id && acknowledgement.signatureHash === attempt.signatureHash,
  )
}

function isBlockingFailure(signature: string): boolean {
  return /(undefined step|ambiguous step|cannot find module|failed to import|import error|typescript|ts-node|syntaxerror|beforeall|beforeeach|afterall|aftereach|fixture|browser world|world setup|cucumber config|setup|infrastructure|placeholder|fallback cucumber binary|dependency confusion|local binary|timed? out|timeout)/i.test(
    signature,
  )
}
