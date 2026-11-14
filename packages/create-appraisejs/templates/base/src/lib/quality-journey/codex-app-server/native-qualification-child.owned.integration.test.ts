import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { taskSpawner } from '../../process/task-spawner'
import { launchNativeQualificationChild, claimOriginalNativeQualificationChild } from './native-qualification-child'
import { captureNativeQualificationPlan } from './native-qualification-contract'
import { createNativeQualificationDiagnostics } from './native-qualification-diagnostics'
import { inspectRpcTransportOwner } from './rpc-transport'
import { syntheticNativeManifest } from './native-qualification.test-support'

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
function fixture(refuse = false) {
  const f = syntheticNativeManifest()
  roots.push(f.parent)
  // Only this fresh synthetic executable is changed; no installed native or credential bytes are read.
  const body = readFileSync(new URL('./fixtures/inert-native-qualification.cjs', import.meta.url), 'utf8')
  writeFileSync(f.manifest.native.path, `#!${process.execPath}\nconst refuseInitialize = ${refuse}\n` + body, {
    mode: 0o700,
  })
  f.manifest.native.sha256 = f.sha(readFileSync(f.manifest.native.path))
  const trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
  const plan = captureNativeQualificationPlan(f.manifest, f.capability)
  return {
    ...f,
    plan,
    trace,
    rows: () =>
      readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
  }
}
const callbacks = {
  transportId: 'synthetic-owned-transport',
  onNotification() {},
  onFault() {},
  assertAdmission() {},
  fenceMcp() {},
  async closeMcp() {
    return true
  },
}
const observer = { beforeRequest() {}, operation() {}, notification() {}, fault() {}, cleanup() {} }
it('crosses actual private stdio, original claim and inert initialize without global retention', async () => {
  const f = fixture(),
    globallyPublished: unknown[] = []
  const published = (value: unknown) => {
    globallyPublished.push(value)
  }
  taskSpawner.on('spawn', published)
  const child = await launchNativeQualificationChild(f.plan, { ...callbacks, diagnostics: f.trace.observer })
  try {
    expect(child.transport.snapshot()).toMatchObject({ issuedRequests: 0, writtenBytes: 0 })
    expect(() => claimOriginalNativeQualificationChild({ ...child }, f.plan, observer)).toThrow(
      /Original pre-handshake/,
    )
    expect(() => claimOriginalNativeQualificationChild(child, {} as typeof f.plan, observer)).toThrow(
      /Original pre-handshake/,
    )
    const original = claimOriginalNativeQualificationChild(child, f.plan, observer)
    expect(inspectRpcTransportOwner(original.owner).transportId).toBe(callbacks.transportId)
    expect(() => claimOriginalNativeQualificationChild(child, f.plan, observer)).toThrow(/Original pre-handshake/)
    await expect(
      child.transport.request('initialize', {
        clientInfo: { name: 'inert', version: '0' },
        capabilities: { experimentalApi: true },
      }),
    ).resolves.toMatchObject({ codexHome: path.join(f.manifest.freshRoot, 'codex-home') })
    await child.transport.notifyInitialized()
    expect(child.transport.snapshot()).toMatchObject({ issuedRequests: 1 })
    expect(globallyPublished).toEqual([])
  } finally {
    taskSpawner.removeListener('spawn', published)
    expect(await child.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    f.trace.close()
  }
  const rows = f.rows()
  for (const stage of [
    'ACQUISITION',
    'RPC_TRANSPORT',
    'CHILD_REGISTER',
    'INITIALIZE_REQUEST',
    'INITIALIZED_NOTIFY',
    'CLEANUP',
  ])
    expect(rows).toContainEqual(expect.objectContaining({ stage, status: 'SETTLED' }))
  expect(rows).toContainEqual(expect.objectContaining({ stage: 'STREAM_CAPTURE', status: 'ACCEPTED' }))
  expect(rows).toContainEqual(expect.objectContaining({ stage: 'CHILD_CLAIM', status: 'ACCEPTED' }))
}, 10000)
it('locates a synthetic RPC refusal after actual acquisition and retains the trace after original stop', async () => {
  const f = fixture(true),
    child = await launchNativeQualificationChild(f.plan, { ...callbacks, diagnostics: f.trace.observer })
  claimOriginalNativeQualificationChild(child, f.plan, observer)
  try {
    await expect(
      child.transport.request('initialize', { clientInfo: { name: 'inert', version: '0' } }),
    ).rejects.toThrow()
  } finally {
    expect(await child.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    f.trace.close()
  }
  expect(f.rows()).toContainEqual(expect.objectContaining({ stage: 'ACQUISITION', status: 'SETTLED' }))
  expect(f.rows()).toContainEqual(
    expect.objectContaining({ stage: 'INITIALIZE_REQUEST', status: 'REFUSED', reason: 'REQUEST_REJECTED' }),
  )
}, 10000)
it('records setup refusal with no acquisition when the original plan no longer verifies', async () => {
  const f = fixture()
  writeFileSync(f.manifest.native.path, 'synthetic changed executable')
  await expect(launchNativeQualificationChild(f.plan, { ...callbacks, diagnostics: f.trace.observer })).rejects.toThrow(
    /plan refused/,
  )
  f.trace.close()
  expect(f.rows()).toContainEqual(expect.objectContaining({ stage: 'PLAN_VERIFY', status: 'REFUSED' }))
  expect(f.rows().some(row => row.stage === 'ACQUISITION')).toBe(false)
})
