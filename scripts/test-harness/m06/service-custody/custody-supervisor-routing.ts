// Whole authenticated message admission and routing, with fixture effects supplied by the actual supervisor.
import assert from 'node:assert/strict'
type Message = Record<string, unknown>
export type ServiceOwnerMessageState = {
  pid: number | undefined
  case: string
  nonce: string
  ownerStarted: boolean
  databasePath: string
  lastOwnerSequence: number
  acceptingMessages: boolean
}
export function routeServiceOwnerMessage(
  raw: unknown,
  state: ServiceOwnerMessageState,
  effects: Readonly<{
    append(encoded: string): void
    failure(error: unknown): void
    handoff(value: Message): void
    nativeReady(value: Message): void
    bindExpected(value: Message): void
    crash(value: Message): void
    terminal(value: Message): void
  }>,
): void {
  assert.ok(raw && typeof raw === 'object')
  const value = raw as Message
  const encoded = JSON.stringify(value)
  assert.ok(Buffer.byteLength(encoded) <= 128 * 1024)
  effects.append(encoded)
  assert.equal(value.pid, state.pid)
  assert.equal(value.case, state.case)
  if (value.type === 'owner-start') {
    assert.equal(state.ownerStarted, false, 'Duplicate original owner-start')
    assert.match(state.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(value.nonce, state.nonce)
    assert.equal(value.databasePath, state.databasePath)
    state.ownerStarted = true
  }
  assert.equal(value.nonce, state.nonce)
  assert.equal(state.ownerStarted, true, 'Original owner-start has not been authenticated')
  if (value.type === 'failure-retained') return effects.failure(new Error(String(value.message)))
  assert.ok(Number.isSafeInteger(value.sequence) && Number(value.sequence) > state.lastOwnerSequence)
  state.lastOwnerSequence = Number(value.sequence)
  if (!state.acceptingMessages) {
    assert.equal(value.type, 'terminal-handoff')
    effects.handoff(value)
    return
  }
  effects.nativeReady(value)
  effects.bindExpected(value)
  if (value.type === 'crash-ready') effects.crash(value)
  if (value.type === 'case-known-closed' || value.type === 'case-retained') effects.terminal(value)
}

// Fixed families keep retained-owner proof paths separate from exited-owner inspection.
export function classifyServiceCase(
  name: string,
  ambiguous: ReadonlySet<string>,
  retainedComplements: Readonly<Record<string, string>>,
): 'retained-ambiguous' | 'retained-complement' | 'exited-recovery' {
  if (ambiguous.has(name)) return 'retained-ambiguous'
  if (Object.hasOwn(retainedComplements, name)) return 'retained-complement'
  return 'exited-recovery'
}
