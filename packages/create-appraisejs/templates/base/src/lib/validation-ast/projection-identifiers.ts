import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
export const validationAstHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
export function validationAstEntityIds(planScope: string, astId: string, scenarioId: string) {
  const scope = validationAstHash({ planScope, astId }).slice(7, 19)
  return { moduleId: `ast-${scope}-module`, suiteId: `ast-${scope}-suite`, caseId: `ast-${scope}-${scenarioId}` }
}
export function validationAstStepId(planScope: string, astId: string, scenarioId: string, stepId: string) {
  return `ast-${validationAstHash({ planScope, astId, scenarioId, stepId }).slice(7, 27)}-step`
}
