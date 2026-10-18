/** Parent-side, single-active-outer-window correlation for the scoped child. */
import { ScopedTransportAudit } from '../codex-app-server-m02-ta-phase-r10/scoped-transport-audit.mjs'

const ID = value =>
  (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value)) || (Number.isSafeInteger(value) && value >= 0)
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')

export function createMatrixAuditSession({ caseId, journal }) {
  let active = null
  let issued = 0
  let fenced = false
  const nativeIds = new Set()
  const unknown = () => {
    fenced = true
    if (!journal.snapshot().unknown) journal.markUnknown('PROTOCOL')
    throw new Error('scoped audit UNKNOWN')
  }
  return Object.freeze({
    issue(planned) {
      if (fenced || active || planned?.caseId !== caseId || planned.index !== issued) return unknown()
      active = new ScopedTransportAudit({
        caseId,
        expectedCalls: planned.rejection
          ? []
          : [{ callId: planned.callId, name: planned.operation, argumentsSha256: planned.argumentsHash }],
        journal,
      })
      issued++
    },
    async observe(event) {
      if (
        fenced ||
        !active ||
        !event ||
        typeof event !== 'object' ||
        Array.isArray(event) ||
        !['request', 'result'].includes(event.kind) ||
        !ID(event.id)
      )
        return unknown()
      if (event.kind === 'request') {
        if (!exact(event, ['kind', 'id', 'name', 'arguments']) || typeof event.name !== 'string') return unknown()
        if (nativeIds.has(event.id)) return unknown()
        nativeIds.add(event.id)
        active.observeRequest({
          jsonrpc: '2.0',
          method: 'tools/call',
          id: event.id,
          params: { name: event.name, arguments: event.arguments },
        })
      } else {
        if (!exact(event, ['kind', 'id', 'result'])) return unknown()
        active.observeResponse({ jsonrpc: '2.0', id: event.id, result: event.result })
      }
      return { status: 'ACKNOWLEDGED' }
    },
    snapshot: () => active?.snapshot() ?? null,
    recordNoDispatch(planned) {
      if (fenced || !active || !planned?.rejection || planned.caseId !== caseId) return unknown()
      return active.recordNoDispatch({
        operationName: planned.operation,
        registryVersion: 'CODE_MODE_REGISTRY_ABSENCE_V1',
      })
    },
    complete() {
      if (fenced || !active) return unknown()
      const result = active.finish()
      active = null
      return result
    },
    status: () => ({ issued, active: Boolean(active), fenced }),
  })
}
