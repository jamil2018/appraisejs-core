// Fixed SERVICE main-process registry. Import creates no timer, process, file or client.
import assert from 'node:assert/strict'
import { fork, type ChildProcess, type ForkOptions } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { FixtureTerminalScope } from './custody-fixture-terminal-receipt.ts'

export type ServiceOwnerSpecification = Readonly<{
  executable: string
  script: string
  args: readonly string[]
  cwd: string
  environment: Readonly<{ PATH: string | undefined; DATABASE_URL: string }>
  case: string
  workspace: string
  nativeScript: string
  nonce: string
}>
export type ServiceOwnerSlot = {
  case: string
  used: boolean
  specification: ServiceOwnerSpecification | undefined
  child: ChildProcess | undefined
  pid: number | undefined
  actualSpawnargs: readonly string[] | undefined
  identityPublished: boolean
  stage: string
  failed: boolean
  firstError: unknown
  firstStage: string | undefined
  launchFailed: boolean
  disposition: 'AUTHENTICATED_TERMINAL' | 'EXACT_CRASH_KNOWN_EXIT' | undefined
  terminalScope: FixtureTerminalScope | undefined
  exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }> | undefined
  assertionsPassed: boolean
  result: unknown
}
export type ServiceSupervisorRegistry = {
  slots: ServiceOwnerSlot[]
  failed: boolean
  firstError: unknown
  firstCase: string | undefined
  firstStage: string | undefined
  interval: ReturnType<typeof setInterval> | undefined
  released: boolean
  reportError: unknown
}
export type ServiceSupervisionEffects = Readonly<{
  fork: typeof fork
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
  writeFileSync: typeof writeFileSync
}>
const originalEffects: ServiceSupervisionEffects = { fork, setInterval, clearInterval, writeFileSync }
const originalRegistries: ServiceSupervisorRegistry[] = []

export function createServiceSupervisorRegistry(
  selected: readonly string[],
  effects: ServiceSupervisionEffects = originalEffects,
): ServiceSupervisorRegistry {
  const registry: ServiceSupervisorRegistry = {
    slots: selected.map(name => ({
      case: name,
      used: false,
      specification: undefined,
      child: undefined,
      pid: undefined,
      actualSpawnargs: undefined,
      identityPublished: false,
      stage: 'UNUSED',
      failed: false,
      firstError: undefined,
      firstStage: undefined,
      launchFailed: false,
      disposition: undefined,
      terminalScope: undefined,
      exit: undefined,
      assertionsPassed: false,
      result: undefined,
    })),
    failed: false,
    firstError: undefined,
    firstCase: undefined,
    firstStage: undefined,
    interval: undefined,
    released: false,
    reportError: undefined,
  }
  originalRegistries.push(registry) // Registration failure occurs before interval or any child exists.
  registry.interval = effects.setInterval(() => void registry, 60000)
  return registry
}
export function failServiceSupervisor(
  registry: ServiceSupervisorRegistry,
  slot: ServiceOwnerSlot | undefined,
  stage: string,
  error: unknown,
): void {
  if (!registry.failed) {
    registry.failed = true
    registry.firstError = error
    registry.firstCase = slot?.case
    registry.firstStage = stage
  }
  if (slot && !slot.failed) {
    slot.failed = true
    slot.firstError = error
    slot.firstStage = stage
  }
}
export function assertServiceSupervisorActive(registry: ServiceSupervisorRegistry): void {
  if (registry.failed) throw registry.firstError
  assert.equal(registry.released, false, 'SERVICE supervisor registry already released')
}
export function reserveServiceOwnerSlot(
  registry: ServiceSupervisorRegistry,
  specification: ServiceOwnerSpecification,
): ServiceOwnerSlot {
  assertServiceSupervisorActive(registry)
  const slot = registry.slots.find(slot => slot.case === specification.case)
  assert.ok(slot, 'Unselected SERVICE owner')
  assert.equal(slot.used, false, 'SERVICE owner allocation already consumed')
  slot.specification = specification
  slot.used = true
  slot.stage = 'PREOWNED'
  return slot
}
export function launchServiceOwner(
  registry: ServiceSupervisorRegistry,
  slot: ServiceOwnerSlot,
  parentPid: number,
  effects: ServiceSupervisionEffects = originalEffects,
): ChildProcess {
  assertServiceSupervisorActive(registry)
  assert.equal(slot.used, true)
  assert.equal(slot.stage, 'PREOWNED')
  const specification = slot.specification!
  const options: ForkOptions = {
    execPath: specification.executable,
    execArgv: [],
    detached: true,
    cwd: specification.cwd,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: specification.environment,
  }
  const originalFork = effects.fork
  try {
    slot.stage = 'FORK'
    // No getter, allocation, report, listener or finally body may intervene after the original return.
    slot.child = originalFork(specification.script, [...specification.args], options)
    slot.stage = 'CHILD_CAPTURED'
    const child = slot.child
    slot.pid = child.pid
    slot.actualSpawnargs = child.spawnargs
    slot.stage = 'IDENTITY_VALIDATION'
    assert.ok(Number.isSafeInteger(slot.pid) && Number(slot.pid) > 0)
    const expectedArgv = [specification.executable, specification.script, ...specification.args]
    assert.deepEqual(slot.actualSpawnargs, expectedArgv)
    slot.stage = 'IDENTITY_PUBLICATION'
    effects.writeFileSync(
      path.join(specification.workspace, 'owner-identity.json'),
      JSON.stringify(
        {
          version: 1,
          type: 'service-owner-preowned-identity',
          parentPid,
          case: specification.case,
          workspace: specification.workspace,
          nativeScript: specification.nativeScript,
          nonce: specification.nonce,
          executable: specification.executable,
          script: specification.script,
          cwd: specification.cwd,
          environment: specification.environment,
          expectedArgv,
          pid: slot.pid,
          actualSpawnargs: slot.actualSpawnargs,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
    slot.identityPublished = true
    slot.stage = 'IDENTITY_PUBLISHED'
    return child
  } catch (error) {
    slot.launchFailed = true
    failServiceSupervisor(registry, slot, slot.stage, error)
    throw registry.firstError
  }
}
export function markServiceCaseAssertionsPassed(
  registry: ServiceSupervisorRegistry,
  slot: ServiceOwnerSlot,
  result: unknown,
): void {
  assertServiceSupervisorActive(registry)
  assert.equal(slot.identityPublished, true)
  assert.ok(slot.disposition, 'Original SERVICE owner disposition is not authenticated')
  slot.result = result
  slot.assertionsPassed = true
}
export function releaseServiceSupervisorRegistry(
  registry: ServiceSupervisorRegistry,
  finalFailureCheck: (slot: ServiceOwnerSlot) => void,
  effects: ServiceSupervisionEffects = originalEffects,
): void {
  assertServiceSupervisorActive(registry)
  try {
    for (const slot of registry.slots) {
      if (!slot.used) continue
      assert.equal(slot.failed, false)
      assert.equal(slot.assertionsPassed, true)
      assert.ok(slot.disposition)
      finalFailureCheck(slot)
      assertServiceSupervisorActive(registry)
    }
    // All original final evidence checks succeeded. Only the main registry interval is released.
    assertServiceSupervisorActive(registry)
    effects.clearInterval(registry.interval)
    registry.released = true
  } catch (error) {
    failServiceSupervisor(registry, undefined, 'FINAL_FAILURE_RECHECK', error)
    throw registry.firstError
  }
}
