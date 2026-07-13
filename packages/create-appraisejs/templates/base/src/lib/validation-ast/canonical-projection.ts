import type { ValidationArtifact } from '@/lib/plan-contract'
import type { LocatorGraph } from '@/lib/locator-graph'
import { validationAstEntityIds, validationAstHash, validationAstStepId } from './projection-identifiers'
import type { ValidationAst } from './schemas'

export type CanonicalLocatorBinding = {
  refId: string
  id: string
  name: string
  value: string
  groupId: string
  groupName: string
  route: string
}

export function locatorBindingsForAst(ast: ValidationAst, graph: LocatorGraph): CanonicalLocatorBinding[] {
  const refs = new Set<string>()
  for (const scenario of ast.scenarios)
    for (const step of scenario.steps)
      for (const value of Object.values(step.action.inputs))
        if (
          value &&
          typeof value === 'object' &&
          'ref' in value &&
          value.ref === 'locator' &&
          'id' in value &&
          typeof value.id === 'string'
        )
          refs.add(value.id)
  const groups = new Map(
    graph.nodes
      .filter(
        (node): node is Extract<LocatorGraph['nodes'][number], { type: 'locator-group' }> =>
          node.type === 'locator-group',
      )
      .map(node => [node.id, node]),
  )
  return graph.nodes
    .filter(
      (node): node is Extract<LocatorGraph['nodes'][number], { type: 'locator' }> =>
        node.type === 'locator' && refs.has(node.id),
    )
    .map(locator => {
      const group = groups.get(locator.groupId)
      const surface = graph.nodes.find(node => node.type === 'surface' && node.id === locator.scope.surfaceId)
      const value =
        locator.strategy.value.selector ?? Object.values(locator.strategy.value).find(item => typeof item === 'string')
      if (!group || typeof value !== 'string') throw new Error(`Locator ${locator.id} cannot be projected.`)
      return {
        refId: locator.id,
        id: locator.id.replace(/^locator_/, ''),
        name: locator.title,
        value,
        groupId: group.id.replace(/^group_/, ''),
        groupName: group.title,
        route: surface?.type === 'surface' ? (surface.route ?? '/') : '/',
      }
    })
}

export function createValidationAstCanonicalProjection(
  ast: ValidationAst,
  planScope: string,
  bindings: CanonicalLocatorBinding[],
) {
  const { moduleId, suiteId } = validationAstEntityIds(planScope, ast.id, ast.scenarios[0]!.id)
  const testCases = ast.scenarios.map(scenario => ({
    id: validationAstEntityIds(planScope, ast.id, scenario.id).caseId,
    title: scenario.title,
    description: scenario.description ?? ast.purpose,
    steps: scenario.steps.map((step, order) => ({
      id: validationAstStepId(planScope, ast.id, scenario.id, step.id),
      order,
      label: step.description,
      gherkinStep: `${step.keyword} ${step.description}`,
      templateStepName: `${step.action.id}@${step.action.version}`,
      parameters: Object.entries(step.action.inputs).map(([name, input]) => parameter(name, input, bindings)),
    })),
  }))
  const validationNode = {
    id: ast.id,
    taskIds: ast.coversTaskIds,
    required: true,
    coverageArgument: ast.coverageArgument,
    testCaseIds: testCases.map(item => item.id),
    appraiseArtifacts: {
      modules: [{ id: moduleId, name: ast.title }],
      testSuites: [
        {
          id: suiteId,
          name: ast.title,
          description: ast.purpose,
          moduleId,
          testCaseIds: testCases.map(item => item.id),
        },
      ],
      testCases,
      locatorGroups: [
        ...new Map(
          bindings.map(item => [item.groupId, { id: item.groupId, name: item.groupName, route: item.route, moduleId }]),
        ).values(),
      ],
      locators: bindings.map(item => ({
        id: item.id,
        name: item.name,
        value: item.value,
        locatorGroupId: item.groupId,
      })),
    },
    gherkinPaths: [`automation/features/${ast.id}.feature`],
    stepPaths: [],
    executable: { path: `automation/features/${ast.id}.feature` },
    astProvenance: {
      schemaVersion: '1',
      astHash: validationAstHash(ast),
      executionAuthority: 'reviewed_publication',
    },
    matrix: ast.matrix.map(entry => ({ browser: entry.browser ?? 'chromium', environment: entry.environmentId })),
    expectedFailures: ast.expectedFailures.map(item => ({
      browser: item.browser,
      environment: item.environmentId,
      signature: item.signature,
      order: item.order,
      lastPassingStepId: item.lastPassingStepId,
    })),
  } satisfies ValidationArtifact['validations'][number]
  const gherkin = ast.scenarios.map(scenario =>
    [`Scenario: ${scenario.title}`, ...scenario.steps.map(step => `  ${step.keyword} ${step.description}`)].join('\n'),
  )
  const value = { validationNode, gherkin }
  return { ...value, projectionHash: validationAstHash(value) }
}

function locatorReference(input: unknown): { id: string } | undefined {
  if (!input || typeof input !== 'object' || !('ref' in input) || input.ref !== 'locator') return undefined
  if (!('id' in input) || typeof input.id !== 'string') return undefined
  return { id: input.id }
}

function parameter(name: string, input: unknown, bindings: CanonicalLocatorBinding[]) {
  const reference = locatorReference(input)
  const binding = reference ? bindings.find(item => item.refId === reference.id) : undefined
  if (reference && !binding) throw new Error(`Resolved locator binding is missing for "${reference.id}".`)
  return {
    name,
    value: typeof input === 'object' ? JSON.stringify(input) : String(input),
    ...(binding ? { locatorId: binding.id, locatorName: binding.name } : {}),
  }
}
