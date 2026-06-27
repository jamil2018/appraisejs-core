export const PLAN_CONTRACT_ERROR_CODES = [
  'artifact-too-large',
  'duplicate-key',
  'duplicate-id',
  'invalid-artifact',
  'invalid-timestamp',
  'invalid-transition',
  'runtime-owned-field',
  'unknown-version',
  'unsafe-alias',
] as const

export type PlanContractErrorCode = (typeof PLAN_CONTRACT_ERROR_CODES)[number]

export class PlanContractError extends Error {
  constructor(
    public readonly code: PlanContractErrorCode,
    message: string,
    public readonly path: string[] = [],
  ) {
    super(message)
    this.name = 'PlanContractError'
  }
}
