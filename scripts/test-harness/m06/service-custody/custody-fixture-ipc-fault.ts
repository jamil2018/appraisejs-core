import { readReleaseEvidenceFile } from '../fixture-evidence-read.mjs'
// Fixed inert fixture gate only. No owner, product, Prisma, database, process or IPC operation.
import assert from 'node:assert/strict'
import { closeSync, constants, fsyncSync, linkSync, openSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type Identity = Readonly<{ case: string; pid: number; nonce: string }>
type Failure = Readonly<{ error: unknown; phase: string; operationPhase: string }>
export type IpcFaultReferenceIds = Readonly<
  Record<'callback' | 'client' | 'gate' | 'outer' | 'restore' | 'source', number>
>
export type IpcFaultWindow = Identity &
  Readonly<{
    type: 'ipc-fault-window'
    version: 1
    sequence: number
    phase: 'IPC_FAULT_GATE_PENDING'
    nextFixtureOperation: 'POST_CALLBACK_SOURCE_STATE_READ'
    windowId: string
    admissionCount: number
    referenceIds: IpcFaultReferenceIds
  }>

// Keep the fully written staging artifact. linkSync publishes one exclusive fixed path atomically;
// no overwrite, unlink, retry or partial-file fallback. These two immutable links are protocol evidence.
export function publishIpcFaultArtifact(
  workspace: string,
  name: 'ipc-fault-window.json' | 'ipc-fault-fence.json',
  value: Readonly<Record<string, unknown>>,
) {
  const windowId = value.windowId
  assert.ok(typeof windowId === 'string')
  assert.match(windowId, /^[a-f0-9]{64}$/)
  const encoded = JSON.stringify(value) + '\n'
  assert.ok(Buffer.byteLength(encoded) <= 16384)
  const staged = path.join(workspace, `.${name}.${windowId}.tmp`)
  const fd = openSync(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeFileSync(fd, encoded)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  linkSync(staged, path.join(workspace, name))
}

function readRelease(workspace: string): unknown {
  const evidence = readReleaseEvidenceFile(path.join(workspace, 'ipc-fault-release.json'), 4096)
  return evidence === undefined ? undefined : (JSON.parse(evidence.bytes.toString('utf8')) as unknown)
}

function validateRelease(value: unknown, window: IpcFaultWindow) {
  assert.ok(value && typeof value === 'object')
  const release = value as Record<string, unknown>
  assert.equal(Object.keys(release).sort().join(','), 'case,nonce,pid,version,windowId')
  assert.equal(release.version, 1)
  for (const key of ['case', 'nonce', 'pid', 'windowId'] as const) assert.equal(release[key], window[key])
  return release
}

// One original deferred and one preregistered unref'd observer. No per-tick retained references/timers.
// Observer is the reviewed exception after FAILED: only fixed release-file validation and this gate resolution.
export function createIpcFaultGate(workspace: string) {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>(done => {
    resolve = done
  })
  let window: IpcFaultWindow | undefined
  let observer: ReturnType<typeof setInterval> | undefined
  let failure: (() => Failure | undefined) | undefined
  let started = false,
    settled = false,
    refused = false
  let observedRelease: unknown, observerError: unknown
  function poll(): void {
    if (!window || settled || refused) return
    try {
      const actual = readRelease(workspace)
      if (actual === undefined) return
      observedRelease = actual // Single actual candidate retained before validation can fail.
      const release = validateRelease(actual, window)
      const first = failure!()
      assert.ok(first, 'Release before actual first failure is refused, never retried')
      assert.equal(first.phase, 'supervisor-disconnect')
      assert.equal(first.operationPhase, window.phase)
      settled = true
      resolve(release)
      clearInterval(observer) // Only this known-settled inert observer; never the owner lifetime anchor.
    } catch (error) {
      observerError = error
      refused = true
      clearInterval(observer) // Invalid evidence permanently refuses the gate; no rejection/release fallback.
    }
  }
  return Object.freeze({
    promise,
    observe(readFailure: () => Failure | undefined) {
      assert.equal(started, false)
      started = true
      failure = readFailure
      observer = setInterval(poll, 10)
      observer.unref()
      return observer
    },
    arm(actualWindow: IpcFaultWindow) {
      assert.equal(started, true)
      assert.equal(window, undefined)
      window = actualWindow
    },
    snapshot: () => ({ started, settled, refused, observedRelease, observerError, observer, window }),
  })
}
