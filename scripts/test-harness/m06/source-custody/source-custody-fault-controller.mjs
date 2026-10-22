// Explicit fault-only packet/campaign. Never selects/generates a client or enters the normal18 registry.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPacketClient } from './source-custody-client-binding.mjs'
import {
  verifySourcePacketInputs,
  environment,
  launch,
  launchSourceOwner,
  knownExit,
  observeLiveness,
} from './source-custody-controller.mjs'
import {
  sourceIpcFaultCases,
  sourceIpcFaultPhase,
  readSourceFaultJson,
  validateSourceFaultObservation,
} from './source-custody-ipc-fault.mjs'
import { assertSourceLaunchActive, failSourceLaunch, publishSourceLaunchFailure } from './source-custody-launch.mjs'
import { runSourceDirectEntry, createSourceControllerBoundary } from './source-custody-direct-entry.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const write = (directory, name, value) =>
  writeFileSync(path.join(directory, name), JSON.stringify(value) + '\n', { flag: 'wx' })
export function verifySourceIpcFaultPacket(packet, reviewPath, selected) {
  assert(path.isAbsolute(packet) && path.isAbsolute(reviewPath))
  assert(sourceIpcFaultCases.includes(selected), 'Exactly two fixed fault selectors')
  const bytes = readFileSync(path.join(packet, 'manifest.json')),
    manifest = JSON.parse(bytes)
  assert.equal(manifest.sourceIpcFaultOnly, true)
  assert.deepEqual(manifest.allowedFaultCases, [...sourceIpcFaultCases])
  assert.equal(manifest.faultReportAfterReceiptThrows, true)
  assert.equal(manifest.faultControllerScript, 'source-custody-fault-controller.mjs')
  assert.equal(manifest.clientBinding?.origin, 'REVIEWED_RELOCATION', 'Fault cases cannot generate/adopt a client')
  assert.equal(manifest.controllerRuntimeReviewRequired, true)
  const review = JSON.parse(readFileSync(reviewPath))
  assert.equal(review.judgment, 'ACCEPT')
  assert.equal(review.scope, 'EXACT_SOURCE_IPC_FAULT16P_CONTROLLER_AND_INPUTS')
  assert.equal(review.faultExecutionAuthorized, true)
  assert.equal(review.controllerExecutionAuthorized, true)
  assert.equal(review.controllerManifestSha256, hash(bytes))
  assert(
    Array.isArray(review.allowedFaultCases) &&
      review.allowedFaultCases.includes(selected) &&
      review.allowedFaultCases.every(value => sourceIpcFaultCases.includes(value)),
  )
  verifyPacketClient(manifest, packet)
  verifySourcePacketInputs(manifest)
  return manifest
}
function faultIdentity(pid, nonce, selected) {
  return selected === 'ipc-cleanup-ready'
    ? { pid, nonce, selectedLabel: 'canonical', faultSelector: selected }
    : { pid, nonce, selected, faultSelector: selected }
}
export function observeSourceIpcFaultOwner(child, directory, selected, nonce, options = {}) {
  const read = options.read ?? (name => readSourceFaultJson(directory, name))
  const incomplete = options.incomplete ?? (() => existsSync(path.join(directory, 'fault-incomplete.json')))
  const boundary = options.launchBoundary
  return new Promise((resolve, reject) => {
    let disconnected = false,
      ready = false,
      failed = false,
      complete = false,
      polling
    const identity = faultIdentity(child.pid, nonce, selected)
    const timer = setTimeout(
      () => fail(new Error('Fault evidence deadline; retain original owner, no retry')),
      options.deadline ?? 60_000,
    )
    function fail(error) {
      if (failed || complete) return
      if (boundary) {
        failSourceLaunch(boundary.custody, 'owner', 'fault-observation', error)
        publishSourceLaunchFailure(boundary.custody, directory)
      }
      failed = true
      clearTimeout(timer)
      clearTimeout(polling)
      if (!ready) reject(error)
    }
    function onDisconnect() {
      if (disconnected) {
        fail(new Error('Duplicate original owner disconnect'))
        return
      }
      disconnected = true
      poll()
    }
    const onError = error => fail(error)
    const onExit = () => fail(new Error('Expected fault owner exited; never known-closed success'))
    const onMessage = () => fail(new Error('Fault owner sent normal/terminal IPC; no ACK/handoff permitted'))
    child.on('disconnect', onDisconnect)
    child.on('error', onError)
    child.on('exit', onExit)
    child.on('message', onMessage)
    function evidence() {
      if (boundary) assertSourceLaunchActive(boundary.custody)
      assert(!failed && disconnected && !child.connected && child.exitCode == null && child.signalCode == null)
      assert(!incomplete(), 'Fault owner published incomplete evidence')
      const armed = read('fault-armed.json'),
        receipt = read('failure-latched.json'),
        observed = read('fault-observations.json')
      assert.equal(armed.value.phase, sourceIpcFaultPhase[selected])
      for (const [key, value] of Object.entries(identity)) assert.equal(armed.value[key], value)
      validateSourceFaultObservation(observed.value, identity, armed.value, receipt)
      return { armed, receipt, observed }
    }
    function poll() {
      if (failed || ready || !disconnected) return
      try {
        const initial = evidence()
        ready = true
        resolve({
          identity,
          receiptDigest: initial.receipt.digest,
          finalize(publish) {
            try {
              if (boundary) assertSourceLaunchActive(boundary.custody)
              assert(!complete && !failed, 'Late fault observation revoked readiness')
              assert.deepEqual(evidence(), initial, 'Fault evidence drift before supervisor publication')
              publish()
              if (boundary) {
                assertSourceLaunchActive(boundary.custody)
                assert.equal(boundary.records.owner, undefined)
                boundary.records.owner = Object.freeze({
                  kind: 'VALIDATED_RETAINED_TERMINAL',
                  role: 'owner',
                  child,
                  terminal: 'SOURCE_IPC_FAULT_OBSERVATION_VALIDATED',
                  finalReconciled: true,
                })
              }
              complete = true
              clearTimeout(timer)
              clearTimeout(polling)
              child.removeListener('disconnect', onDisconnect)
              child.removeListener('error', onError)
              child.removeListener('exit', onExit)
              child.removeListener('message', onMessage)
            } catch (error) {
              fail(error)
              throw boundary?.custody.failed ? boundary.custody.firstError : error
            }
          },
        })
      } catch (error) {
        if (error.code === 'ENOENT') polling = setTimeout(poll, 10)
        else fail(error)
      }
    }
  })
}
async function faultSupervisor(packet, directory, selected, nonce, reviewPath, guard) {
  guard.assertActive()
  assert.deepEqual(process.execArgv, [])
  const manifest = verifySourceIpcFaultPacket(packet, reviewPath, selected)
  assert(path.isAbsolute(directory) && !existsSync(directory))
  mkdirSync(directory)
  const env = environment(directory)
  const boundary = createSourceControllerBoundary(guard, { directory, selected, nonce })
  const { custody, records } = boundary
  try {
    write(directory, 'attempt.json', {
      status: 'CONSUMED_SOURCE_IPC_FAULT_NO_RETRY',
      nonce,
      selected,
      supervisorPid: process.pid,
    })
    const setup = launch(
      custody,
      path.join(packet, 'source-custody-setup.mjs'),
      [packet, directory, selected, 'setup'],
      directory,
      env,
      'setup',
      false,
    )
    await knownExit(setup, directory, 'setup', 30_000, boundary)
    assertSourceLaunchActive(custody)
    verifyPacketClient(manifest, packet)
    const script = path.join(
      packet,
      selected === 'ipc-cleanup-ready' ? 'source-custody-cleanup-owner.mjs' : 'source-custody-owner.mjs',
    )
    const args = [directory, selected === 'ipc-cleanup-ready' ? 'canonical' : selected, nonce, selected]
    const owner = launchSourceOwner(custody, manifest, packet, script, args, directory, env, selected, nonce)
    try {
      const observed = await observeSourceIpcFaultOwner(owner, directory, selected, nonce, { launchBoundary: boundary })
      assertSourceLaunchActive(custody)
      observed.finalize(() =>
        write(directory, 'supervisor-result.json', {
          status: 'EXPECTED_FAULT_RETAINED_SUPERVISOR_EXIT',
          selected,
          nonce,
          supervisorPid: process.pid,
          ownerPid: owner.pid,
          receiptDigest: observed.receiptDigest,
        }),
      )
    } finally {
      if (!custody.failed) {
        owner.channel?.unref()
        owner.unref() // Never kill, cleanup, reconnect, inspect DB or release the retained owner.
      }
    }
    guard.assertActive()
    custody.complete(records)
  } catch (error) {
    failSourceLaunch(custody, custody.currentRole ?? 'setup', 'fault-supervisor-continuation', error)
    publishSourceLaunchFailure(custody, directory)
    try {
      write(directory, 'fault-controller-failure.json', {
        error: String(error.message).slice(0, 2000),
        noCleanupOrRetry: true,
      })
    } catch (reportError) {
      failSourceLaunch(custody, custody.currentRole ?? 'setup', 'failure-reporter', reportError)
    }
    throw custody.firstError
  }
}
export async function runSourceIpcFaultCase(packet, campaign, selected, nonce, reviewPath, guard) {
  guard.assertActive()
  verifySourceIpcFaultPacket(packet, reviewPath, selected) // Exact fault + physical review before any allocation.
  assert(path.isAbsolute(campaign) && !existsSync(campaign))
  mkdirSync(campaign)
  write(campaign, 'campaign.json', {
    status: 'CONSUMED_SOURCE_IPC_FAULT_CAMPAIGN_NO_RETRY',
    selected,
    nonce,
    testPid: process.pid,
  })
  const directory = path.join(campaign, 'attempt')
  const boundary = createSourceControllerBoundary(guard, { directory: campaign, selected, nonce })
  const { custody, records } = boundary
  try {
    const child = launch(
      custody,
      path.join(packet, 'source-custody-fault-controller.mjs'),
      ['--fault-supervisor', packet, directory, selected, nonce, reviewPath],
      campaign,
      { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin' },
      'supervisor',
      false,
    )
    await knownExit(child, campaign, 'supervisor', 120_000, boundary)
    assertSourceLaunchActive(custody)
    const exit = JSON.parse(readFileSync(path.join(campaign, 'supervisor-exit.json')))
    write(directory, 'supervisor-exit.json', exit)
    const result = JSON.parse(readFileSync(path.join(directory, 'supervisor-result.json')))
    assert.equal(result.status, 'EXPECTED_FAULT_RETAINED_SUPERVISOR_EXIT')
    assert.equal(result.selected, selected)
    assert.equal(result.nonce, nonce)
    observeLiveness(directory) // Only after actual distinct supervisor exit0, original PID/script/nonce tuple.
    guard.assertActive()
    custody.complete(records)
    return result
  } catch (error) {
    failSourceLaunch(custody, 'supervisor', 'fault-campaign-continuation', error)
    publishSourceLaunchFailure(custody, campaign)
    try {
      write(campaign, 'STOP.json', {
        selected,
        nonce,
        directory,
        error: String(error.message).slice(0, 2000),
        noAutomaticRetry: true,
      })
    } catch (reportError) {
      failSourceLaunch(custody, 'supervisor', 'failure-reporter', reportError)
    }
    throw custody.firstError
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  (process.argv[2] === '--fault-supervisor' || process.argv[2] === '--fault-case')
) {
  const operation = process.argv[2] === '--fault-supervisor' ? faultSupervisor : runSourceIpcFaultCase
  runSourceDirectEntry(guard =>
    operation(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7], guard),
  )
}
