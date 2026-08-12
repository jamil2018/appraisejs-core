import { ServiceError } from '@/services/shared/errors'

export type CoordinatorMethod = 'GET' | 'POST' | 'PUT'

type OperationDefinition<OperationId extends string> = Readonly<{
  id: OperationId
  method: CoordinatorMethod
  pattern: readonly string[]
}>

const parameterSegment = /^:[a-z][a-zA-Z0-9]*$/

function matchesPattern(pattern: readonly string[], operation: readonly string[]): boolean {
  const wildcardIndex = pattern.indexOf('*')
  if (wildcardIndex >= 0 && wildcardIndex !== pattern.length - 1) return false
  if (wildcardIndex < 0 && pattern.length !== operation.length) return false
  if (wildcardIndex >= 0 && operation.length < wildcardIndex) return false

  return pattern.every((segment, index) => {
    if (segment === '*') return true
    if (parameterSegment.test(segment)) return Boolean(operation[index])
    return operation[index] === segment
  })
}

export function createCoordinatorOperationRegistry<const OperationId extends string>(
  definitions: readonly OperationDefinition<OperationId>[],
) {
  const identities = new Set<string>()
  for (const definition of definitions) {
    const identity = `${definition.method}:${definition.pattern.join('/')}`
    if (identities.has(identity)) throw new Error(`Duplicate coordinator operation pattern: ${identity}`)
    identities.add(identity)
  }

  return Object.freeze({
    definitions: Object.freeze([...definitions]),
    resolve(method: CoordinatorMethod, operation: readonly string[]): OperationId {
      const match = definitions.find(
        definition => definition.method === method && matchesPattern(definition.pattern, operation),
      )
      if (!match) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
      return match.id
    },
  })
}

export const coordinatorOperationRegistry = createCoordinatorOperationRegistry([
  { id: 'diagnostic', method: 'GET', pattern: ['diagnostic'] },
  { id: 'test-run-evidence', method: 'GET', pattern: ['test-runs', '*'] },
  { id: 'operations', method: 'GET', pattern: ['operations', '*'] },
  { id: 'step-definitions-read', method: 'GET', pattern: ['step-definitions', '*'] },
  { id: 'target-projects-list', method: 'GET', pattern: ['target-projects'] },
  { id: 'locator-graph', method: 'GET', pattern: ['locator-graph', '*'] },
  { id: 'environment-read', method: 'GET', pattern: ['environments'] },
  { id: 'quality-read', method: 'GET', pattern: ['quality', '*'] },
  { id: 'step-definitions-write', method: 'POST', pattern: ['step-definitions', '*'] },
  { id: 'diagnostic-preflight-write', method: 'POST', pattern: ['diagnostic', 'preflight'] },
  { id: 'quality-write', method: 'POST', pattern: ['quality', '*'] },
  { id: 'environment-write', method: 'POST', pattern: ['environments', 'ensure'] },
  { id: 'target-project-write', method: 'POST', pattern: ['target-projects'] },
  { id: 'test-run-write', method: 'POST', pattern: ['test-runs', '*'] },
] as const)

export type CoordinatorOperationId = (typeof coordinatorOperationRegistry.definitions)[number]['id']
