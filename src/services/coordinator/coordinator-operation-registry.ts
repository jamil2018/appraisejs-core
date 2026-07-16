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
  { id: 'delegation-read', method: 'GET', pattern: ['delegations', ':id'] },
  { id: 'diagnostic', method: 'GET', pattern: ['diagnostic'] },
  { id: 'test-run-evidence', method: 'GET', pattern: ['test-runs', '*'] },
  { id: 'plan-health', method: 'GET', pattern: ['plans', ':planId', 'health'] },
  { id: 'actions', method: 'GET', pattern: ['actions', '*'] },
  { id: 'target-projects-list', method: 'GET', pattern: ['target-projects'] },
  { id: 'locator-graph', method: 'GET', pattern: ['locator-graph', '*'] },
  { id: 'providers-list', method: 'GET', pattern: ['providers'] },
  { id: 'provider-runs-read', method: 'GET', pattern: ['provider-runs', '*'] },
  { id: 'plan-read', method: 'GET', pattern: ['plans', ':planId'] },
  { id: 'plan-events-read', method: 'GET', pattern: ['plans', ':planId', 'events'] },
  { id: 'plan-review-read', method: 'GET', pattern: ['plans', ':planId', 'review'] },
  { id: 'plan-validations-read', method: 'GET', pattern: ['plans', ':planId', 'validations', '*'] },
  { id: 'plan-completion-read', method: 'GET', pattern: ['plans', ':planId', 'completion'] },
  { id: 'delegation-create', method: 'POST', pattern: ['delegations'] },
  { id: 'delegation-revoke', method: 'POST', pattern: ['delegations', ':id', 'revoke'] },
  { id: 'objective-create', method: 'POST', pattern: ['objectives'] },
  { id: 'coordination-slo', method: 'POST', pattern: ['coordination-slo'] },
  { id: 'repository-export', method: 'POST', pattern: ['repository-exports', '*'] },
  {
    id: 'delegated-validation-submit',
    method: 'POST',
    pattern: ['delegated', 'validation-ast-submissions'],
  },
  { id: 'provider-runs-write', method: 'POST', pattern: ['provider-runs', '*'] },
  { id: 'plan-snapshot', method: 'POST', pattern: ['plans', ':planId', 'snapshot'] },
  { id: 'plan-continuation', method: 'POST', pattern: ['plans', ':planId', 'continuation-package'] },
  { id: 'providers-write', method: 'POST', pattern: ['providers', '*'] },
  { id: 'register', method: 'POST', pattern: ['register'] },
  { id: 'heartbeat', method: 'POST', pattern: ['heartbeat'] },
  { id: 'plan-create', method: 'POST', pattern: ['plans'] },
  { id: 'target-project-write', method: 'POST', pattern: ['target-projects'] },
  { id: 'test-run-write', method: 'POST', pattern: ['test-runs', '*'] },
  { id: 'plan-start', method: 'POST', pattern: ['plans', ':planId', 'start'] },
  { id: 'plan-task-update', method: 'POST', pattern: ['plans', ':planId', 'tasks', '*'] },
  { id: 'plan-event-acknowledge', method: 'POST', pattern: ['plans', ':planId', 'events'] },
  { id: 'plan-validation-write', method: 'POST', pattern: ['plans', ':planId', 'validations', '*'] },
  { id: 'plan-baseline-write', method: 'POST', pattern: ['plans', ':planId', 'baseline', '*'] },
  { id: 'plan-implementation-write', method: 'POST', pattern: ['plans', ':planId', 'implementation', '*'] },
  { id: 'plan-revise', method: 'PUT', pattern: ['plans', ':planId'] },
] as const)

export type CoordinatorOperationId = (typeof coordinatorOperationRegistry.definitions)[number]['id']
