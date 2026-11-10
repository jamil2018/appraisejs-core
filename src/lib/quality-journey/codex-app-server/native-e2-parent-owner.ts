import type { E2FiniteEnvelope } from '../provider-grant-contract'

const ownerBrand: unique symbol = Symbol('qualified-original-e2-owner')
const commandBrand: unique symbol = Symbol('qualified-committed-e2-command')
export type OriginalE2Owner = Readonly<{ [ownerBrand]: true }>
export type CommittedE2Command = Readonly<{ [commandBrand]: true }>

/** Immutable data only. Never accept a DB client, callback, constructor or qualification flag here. */
export type E2ParentGrantRequest = Readonly<{
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
  attemptId: string
  authorizationId: string
  leaseId: string
  assignmentGeneration: number
  operationPreparationId: string
  envelope: E2FiniteEnvelope
  requestDigest: string
}>
export type E2UnqualifiedSourceRefusal = Readonly<{
  status: 'REFUSED'
  reason: 'REFUSED_UNQUALIFIED_SOURCE'
}>
const sourceRefusal = (): E2UnqualifiedSourceRefusal =>
  ({ status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_SOURCE' })

/**
 * No qualified production issuer is enrolled. There is no exported owner factory,
 * test switch, injected transaction or installer. The future qualified supplier
 * integration must capture the real client/issuer/constructor privately; a row,
 * fixture-core token or inert SQL receipt can never populate that owner domain.
 */
export async function requestOriginalE2Grant(
  _owner: OriginalE2Owner,
  _request: E2ParentGrantRequest,
): Promise<E2UnqualifiedSourceRefusal> {
  return sourceRefusal()
}

/** No constructor callback is accepted while original source qualification is absent. */
export async function spawnOriginalAfterGrant(
  _owner: OriginalE2Owner,
  _command: CommittedE2Command,
): Promise<E2UnqualifiedSourceRefusal> {
  return sourceRefusal()
}

/** Recovery has no qualified route or deadline; this refusal touches neither SQL nor IPC. */
export const refuseUnqualifiedE2RecoveryControl = (): Readonly<{
  status: 'REFUSED'; reason: 'REFUSED_UNQUALIFIED_CONTROL'
}> => ({ status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_CONTROL' })
