// Fixed original owner lifetime/nonce bootstrap. No resource is created on import.
import assert from 'node:assert/strict'
import { createFixtureTerminal, createFixtureAdmission } from './custody-fixture-admission.ts'

export function serviceOwnerNonce(argv: readonly string[]): string {
  assert.equal(argv.length, 6, 'Original service owner requires its preowned supervisor argv nonce')
  const nonce = argv[5]
  assert.match(nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  return nonce
}

export function createServiceOwnerLifetime(
  retained: unknown[],
  connected: () => boolean,
  reportFailure: (error: unknown, phase: string) => void,
  interval: typeof setInterval = setInterval,
) {
  const lifetime = interval(() => void retained, 60000)
  const admission = createFixtureAdmission(retained, connected, reportFailure)
  return Object.freeze({ lifetime, admission })
}

/** Actual current/legacy process lifetime, admission and terminal identity; adapters retain distinct final rules. */
export function createServiceOwnerBootstrap(
  retained: unknown[],
  reportFailure: (error: unknown, phase: string) => void,
  name: string,
  nonce: string,
  sendHandoff: Parameters<typeof createFixtureTerminal>[2],
  adapter: Parameters<typeof createFixtureTerminal>[3],
  ownerProcess: Pick<NodeJS.Process, 'pid' | 'connected' | 'send'> = process,
  interval: typeof setInterval = setInterval,
) {
  const { lifetime, admission } = createServiceOwnerLifetime(
    retained,
    () => Boolean(ownerProcess.connected && ownerProcess.send),
    reportFailure,
    interval,
  )
  const terminal = createFixtureTerminal(admission, { case: name, pid: ownerProcess.pid, nonce }, sendHandoff, adapter)
  admission.keepActual('lifetime-interval', lifetime)
  return Object.freeze({ lifetime, admission, terminal })
}
