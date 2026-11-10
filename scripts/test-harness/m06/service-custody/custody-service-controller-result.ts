import type { ServiceSupervisorRegistry } from './custody-service-supervision'

/** Passive exact owner result projection; no cleanup, liveness inference or qualification. */
export function serviceControllerResult(registry: ServiceSupervisorRegistry, pid: number, selected: readonly string[]) {
  return {
    version: 1,
    type: 'service-main-controller-success',
    pid,
    cases: selected,
    owners: registry.slots.map(slot => ({
      case: slot.case,
      workspace: slot.specification?.workspace,
      pid: slot.pid,
      nonce: slot.specification?.nonce,
      disposition: slot.disposition,
      terminalType: slot.terminalScope?.terminalType ?? null,
      assertionsPassed: slot.assertionsPassed,
    })),
    runtimeQualified: false,
    providerQualified: false,
  }
}
