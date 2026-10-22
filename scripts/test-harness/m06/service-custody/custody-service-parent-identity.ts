// Exact original Python->Node identity rendezvous. No owner creation and no process deadline.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readTerminalEvidenceFile } from '../fixture-evidence-read.mjs'
import {
  assertServiceSupervisorActive,
  failServiceSupervisor,
  type ServiceSupervisorRegistry,
} from './custody-service-supervision.ts'
type ParentIdentity = Readonly<{
  pid: number
  executable: string
  argv: readonly string[]
  cwd: string
  identityFilename: string
}>
export function assertServiceParentIdentity(value: unknown, expected: ParentIdentity): void {
  assert.ok(value && typeof value === 'object')
  const record = value as Record<string, unknown>
  assert.equal(Object.keys(record).sort().join(','), 'argv,cwd,executable,identityFilename,pid,type,version')
  assert.equal(record.version, 1)
  assert.equal(record.type, 'service-os-parent-identity')
  assert.ok(Number.isSafeInteger(record.pid) && Number(record.pid) > 0)
  for (const key of ['pid', 'executable', 'cwd', 'identityFilename'] as const) assert.equal(record[key], expected[key])
  assert.deepEqual(record.argv, expected.argv)
}
export async function awaitServiceParentIdentity(
  registry: ServiceSupervisorRegistry,
  filename: string,
  expected: ParentIdentity,
  effects: Readonly<{ read(filename: string): unknown | undefined; pause(): Promise<void> }> = {
    read(filename) {
      const file = readTerminalEvidenceFile(filename, 16384)
      return file === undefined ? undefined : (JSON.parse(file.bytes.toString('utf8')) as unknown)
    },
    pause: () => new Promise(resolve => setTimeout(resolve, 10)),
  },
): Promise<void> {
  try {
    assert.ok(path.isAbsolute(filename))
    assert.equal(filename, expected.identityFilename)
    for (;;) {
      assertServiceSupervisorActive(registry)
      const value = effects.read(filename)
      if (value !== undefined) {
        assertServiceParentIdentity(value, expected)
        assertServiceSupervisorActive(registry)
        return
      }
      // This is an indefinite pre-owner rendezvous, not a timeout or launch admission.
      await effects.pause()
    }
  } catch (error) {
    failServiceSupervisor(registry, undefined, 'ORIGINAL_PARENT_IDENTITY', error)
    throw registry.firstError
  }
}
