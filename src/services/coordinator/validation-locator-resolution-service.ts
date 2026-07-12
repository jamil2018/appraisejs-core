import type { ValidationArtifact, ValidationDraft } from '@/lib/plan-contract'

type ValidationNode = ValidationArtifact['validations'][number] | ValidationDraft['validations'][number]
export type LocatorResolutionBlocker = ValidationDraft['blockers'][number]
type Locator = ValidationNode['appraiseArtifacts']['locators'][number]
type StepParameter = ValidationNode['appraiseArtifacts']['testCases'][number]['steps'][number]['parameters'][number]
type LocatorIndex = { byId: Map<string, Locator>; byName: Map<string, Locator[]>; groupIds: Set<string> }

function locatorParameter(parameter: { type?: string; locatorId?: string; locatorName?: string }) {
  return parameter.type?.toUpperCase() === 'LOCATOR' || Boolean(parameter.locatorId || parameter.locatorName)
}

function indexLocators(node: ValidationNode): LocatorIndex {
  const byName = new Map<string, Locator[]>()
  for (const locator of node.appraiseArtifacts.locators) {
    byName.set(locator.name, [...(byName.get(locator.name) ?? []), locator])
  }
  return {
    byId: new Map(node.appraiseArtifacts.locators.map(locator => [locator.id, locator])),
    byName,
    groupIds: new Set(node.appraiseArtifacts.locatorGroups.map(group => group.id)),
  }
}

function matchesForParameter(parameter: StepParameter, index: LocatorIndex) {
  if (!parameter.locatorId) return index.byName.get(parameter.locatorName ?? parameter.value) ?? []
  const locator = index.byId.get(parameter.locatorId)
  return locator ? [locator] : []
}

function blocker(
  code: string,
  path: Array<string | number>,
  phrase: string,
  message: string,
  recovery: string,
): LocatorResolutionBlocker {
  return { code, path, phrase, message, recovery }
}

function validateParameter(
  parameter: StepParameter,
  index: LocatorIndex,
  path: Array<string | number>,
  context: string,
): LocatorResolutionBlocker[] {
  if (!locatorParameter(parameter)) return []
  const requested = parameter.locatorId ?? parameter.locatorName ?? parameter.value
  const matches = matchesForParameter(parameter, index)
  if (matches.length === 0)
    return [
      blocker(
        'missing-locator-reference',
        path,
        requested,
        `${context} requests locator "${requested}", but none was found.`,
        'Use locator_search, then bind the parameter to exactly one locator ID in the validation draft.',
      ),
    ]
  if (matches.length > 1)
    return [
      blocker(
        'ambiguous-locator-reference',
        path,
        requested,
        `${context} requests locator "${requested}", but ${matches.length} compatible locators were found.`,
        'Use locator_search, then bind the parameter to exactly one locator ID in the validation draft.',
      ),
    ]
  const [locator] = matches
  if (parameter.locatorName && locator.name !== parameter.locatorName)
    return [
      blocker(
        'mismatched-locator-reference',
        path,
        requested,
        `${context} binds locator ID "${locator.id}" but names "${parameter.locatorName}".`,
        'Use locator_search and update the locator ID/name pair to the same canonical locator.',
      ),
    ]
  if (!index.groupIds.has(locator.locatorGroupId))
    return [
      blocker(
        'stale-locator-reference',
        path,
        requested,
        `${context} binds locator "${locator.id}" to missing group "${locator.locatorGroupId}".`,
        'Add the canonical locator group to the draft or replace the stale locator binding.',
      ),
    ]
  return []
}

export function validateValidationLocatorBindings(validations: ValidationNode[]): LocatorResolutionBlocker[] {
  return validations.flatMap((node, validationIndex) => {
    const index = indexLocators(node)

    return node.appraiseArtifacts.testCases.flatMap((testCase, testCaseIndex) =>
      testCase.steps.flatMap((step, stepIndex) =>
        step.parameters.flatMap((parameter, parameterIndex) =>
          validateParameter(
            parameter,
            index,
            [
              'validations',
              validationIndex,
              'appraiseArtifacts',
              'testCases',
              testCaseIndex,
              'steps',
              stepIndex,
              'parameters',
              parameterIndex,
            ],
            `Validation "${node.id}", case "${testCase.id}", step "${step.id}"`,
          ),
        ),
      ),
    )
  })
}
