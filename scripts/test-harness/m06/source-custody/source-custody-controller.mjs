// Canonical tests use finite standalone transport; only guarded direct OS entries own the case algorithm.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSourceRetainedSupervisor, assertSourceKnownClosedExit } from './source-custody-guard.mjs'
import { verifyPacketClient } from './source-custody-client-binding.mjs'
import { readFixtureAuditRecord as read, publishFixtureAuditRecord as write } from '../fixture-audit-records.mjs'
import {
  launchSourceChild,
  assertSourceLaunchActive,
  failSourceLaunch,
  publishSourceLaunchFailure,
} from './source-custody-launch.mjs'
import { runSourceDirectEntry, createSourceControllerBoundary } from './source-custody-direct-entry.mjs'
import {
  runSourceCustodyTransport,
  readSourceTransportRequest,
  publishSourceTransportResult,
} from './source-custody-transport.mjs'
import { sourceControllerEffects } from './source-custody-controller-effects.mjs'
const { process: controllerProcess } = sourceControllerEffects
const controllerScript = fileURLToPath(import.meta.url)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const cases = Object.freeze({
  storage: { inspect: true },
  'cleanup-canonical': { cleanup: 'canonical' },
  'cleanup-resolver': { cleanup: 'resolver' },
  'source-happy': {},
  'journal-binding': {},
  'foreign-client': {},
  'ledger-count': {},
  'ledger-utf8': {},
  'ledger-null-utf8': {},
  'ledger-type': {},
  'reserve-rejection': { retained: true },
  'flush-rejection': { retained: true },
  'source-finalizer-throw': { retained: true },
  'source-finalizer-async-rejection': { retained: true },
  'source-finalizer-helper-throw': { retained: true },
  'namespace-adoption': { retained: true },
  'late-observer': { retained: true },
  'allocation-overflow': { retained: true },
})
function verifyPacket(packet, reviewPath, selected) {
  const manifestBytes = readFileSync(path.join(packet, 'manifest.json')),
    manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.clientReady, true, 'Client identity remains independently blocked')
  assert(!manifest.sourceIpcFaultOnly, 'Fault packet cannot use normal-case policy')
  verifyPacketClient(manifest, packet)
  if (manifest.controllerRuntimeReviewRequired) {
    assert(reviewPath && path.isAbsolute(reviewPath), 'Exact independent controller review required before allocation')
    const review = read(reviewPath)
    assert.equal(review.judgment, 'ACCEPT')
    assert.equal(review.scope, 'EXACT_SOURCE_REGRESSION8_CONTROLLER_AND_INPUTS')
    assert.equal(review.controllerExecutionAuthorized, true)
    assert.equal(review.controllerManifestSha256, hash(manifestBytes))
    assert(
      Array.isArray(review.allowedCases) && review.allowedCases.includes(selected),
      'Selected case not authorized by exact review',
    )
  }
  verifySourcePacketInputs(manifest)
  return manifest
}
export function verifySourcePacketInputs(manifest) {
  for (const row of [
    ...manifest.files,
    ...manifest.generatedFiles,
    ...manifest.packetFiles,
    manifest.executable,
    manifest.psExecutable,
    ...[manifest.clientAcceptance].filter(Boolean),
  ]) {
    const bytes = readFileSync(row.filename)
    assert.equal(bytes.length, row.bytes)
    assert.equal(hash(bytes), row.sha256, 'Bound input changed: ' + row.filename)
  }
  assert.equal(controllerProcess.execPath, manifest.executable.filename)
  assert.equal(controllerProcess.version, manifest.nodeVersion)
}
function detach(child) {
  if (!child) return
  try {
    child.channel?.unref()
  } catch {}
  try {
    if (child.connected) child.disconnect()
  } catch {}
  try {
    child.unref()
  } catch {}
}
export function environment(directory) {
  for (const name of ['home', 'tmp']) mkdirSync(path.join(directory, name))
  return {
    PATH: path.dirname(controllerProcess.execPath) + ':/usr/bin:/bin',
    HOME: path.join(directory, 'home'),
    TMPDIR: path.join(directory, 'tmp'),
    NODE_ENV: 'test',
    NO_COLOR: '1',
    DATABASE_URL: `file:${path.join(directory, 'tested.db')}`,
  }
}
export function launch(custody, script, args, directory, env, label, ipc) {
  return launchSourceChild(custody, label, {
    kind: ipc ? 'fork-logged' : 'spawn-logged',
    script,
    args,
    cwd: directory,
    env,
    execPath: controllerProcess.execPath,
    execArgv: [],
    detached: true,
    stdoutPath: path.join(directory, label + '.stdout'),
    stderrPath: path.join(directory, label + '.stderr'),
  })
}

export function launchSourceOwner(custody, manifest, packet, script, args, directory, env, selected, nonce) {
  verifyPacketClient(manifest, packet) // Adjacent current physical/env gate before the original launch.
  const owner = launch(custody, script, args, directory, env, 'owner', true)
  try {
    write(directory, 'owner-created.json', {
      pid: owner.pid,
      script,
      args,
      nonce,
      selected,
      execPath: controllerProcess.execPath,
      execArgv: [],
      detached: true,
    })
    assertSourceLaunchActive(custody)
    return owner
  } catch (error) {
    failSourceLaunch(custody, 'owner', 'supervisor-continuation', error)
    publishSourceLaunchFailure(custody, directory)
    throw custody.firstError
  }
}

export async function knownExit(child, directory, label, deadline = 30_000, boundary) {
  return new Promise((resolve, reject) => {
    function failure(error) {
      if (boundary) {
        failSourceLaunch(boundary.custody, label, 'known-exit', error)
        publishSourceLaunchFailure(boundary.custody, directory)
      }
      if (!boundary?.custody.failed) detach(child)
      reject(boundary?.custody.failed ? boundary.custody.firstError : error)
    }
    const timer = setTimeout(() => {
      failure(new Error(label + ' deadline; no kill/retry'))
    }, deadline)
    child.once('error', error => {
      clearTimeout(timer)
      failure(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      try {
        if (boundary) assertSourceLaunchActive(boundary.custody)
        write(directory, label + '-exit.json', { pid: child.pid, code, signal })
        if (code === 0 && signal === null) {
          if (boundary) {
            assertSourceLaunchActive(boundary.custody)
            assert.equal(boundary.records[label], undefined)
            boundary.records[label] = Object.freeze({ kind: 'KNOWN_EXIT0', role: label, child, code, signal })
          }
          resolve()
        } else failure(new Error(label + ' did not exit0'))
      } catch (error) {
        failure(error)
      }
    })
  })
}

async function observeOwner(child, directory, selected, nonce, boundary) {
  return new Promise((resolve, reject) => {
    let reported = false,
      known = false,
      failed = false,
      readinessResolved = false
    const timer = setTimeout(() => fail(new Error('Owner deadline; retain actual owner, no kill')), 60_000)
    const retainedTerminal = cases[selected].retained
      ? createSourceRetainedSupervisor({
          identity: { nonce, pid: child.pid, selected },
          directory,
          send: (message, callback) => child.send(message, callback),
          failure: fail,
        })
      : undefined
    function fail(error) {
      if (failed) return
      if (boundary) {
        failSourceLaunch(boundary.custody, 'owner', 'owner-observation', error)
        publishSourceLaunchFailure(boundary.custody, directory)
      }
      failed = true
      known = false
      retainedTerminal?.abort(error)
      clearTimeout(timer)
      if (readinessResolved) {
        // A later actual observation cannot be erased by an already-resolved readiness Promise.
        try {
          write(directory, 'owner-late-observation-failure.json', {
            pid: child.pid,
            nonce,
            selected,
            error: String(error.message).slice(0, 2000),
          })
        } catch (reportError) {
          if (boundary) failSourceLaunch(boundary.custody, 'owner', 'failure-reporter', reportError)
        }
        controllerProcess.exitCode = 1
      }
      if (!boundary?.custody.failed) detach(child)
      reject(boundary?.custody.failed ? boundary.custody.firstError : error)
    }
    child.once('error', fail)
    child.on('message', message => {
      if (failed) return
      try {
        if (boundary) assertSourceLaunchActive(boundary.custody)
        assert(Buffer.byteLength(JSON.stringify(message)) <= 32768)
        assert.equal(message.pid, child.pid)
        assert.equal(message.selected ?? 'cleanup-' + message.selectedLabel, selected)
        assert.equal(message.nonce, nonce)
        if (retainedTerminal) {
          retainedTerminal.receive(message)
          if (failed) return
          const name = retainedTerminal.state === 'PENDING_RETENTION' ? 'owner-preliminary.json' : 'owner-handoff.json'
          write(directory, name, message)
          return
        }
        assert(!reported, 'One bounded known-closed result only')
        reported = true
        write(directory, 'owner-status.json', message)
        assert(['KNOWN_CLOSED_SOURCE_CASE', 'KNOWN_CLOSED_INITIAL_A_ONLY'].includes(message.status))
        known = true
        child.send({ type: 'ACK_KNOWN_CLOSED' }, error => {
          if (error) fail(error)
        })
      } catch (error) {
        fail(error)
      }
    })
    child.on('disconnect', () => {
      if (failed) return
      if (!retainedTerminal) {
        if (!known) fail(new Error('Owner disconnected before known-closed result'))
        return // Known-closed authority still waits for actual exit0 below.
      }
      retainedTerminal.observeDisconnect()
      if (failed) return
      readinessResolved = true
      resolve({
        retained: true,
        finalize(publish) {
          try {
            if (failed) throw retainedTerminal.firstFailure
            if (boundary) assertSourceLaunchActive(boundary.custody)
            write(directory, 'owner-status.json', retainedTerminal.result)
            const result = retainedTerminal.complete(publish)
            if (failed) throw retainedTerminal.firstFailure
            if (boundary) {
              assertSourceLaunchActive(boundary.custody)
              assert.equal(boundary.records.owner, undefined)
              boundary.records.owner = Object.freeze({
                kind: 'VALIDATED_RETAINED_TERMINAL',
                role: 'owner',
                child,
                terminal: 'SOURCE_RETENTION_CALLBACK_COMMITTED',
                finalReconciled: true,
              })
            }
            clearTimeout(timer)
            if (!boundary?.custody.failed) detach(child)
            return result
          } catch (error) {
            fail(error)
            throw retainedTerminal.firstFailure
          }
        },
      })
    })
    child.once('exit', (code, signal) => {
      if (failed) return
      try {
        if (boundary) assertSourceLaunchActive(boundary.custody)
        write(directory, 'owner-exit.json', { pid: child.pid, code, signal, known })
        assertSourceKnownClosedExit(known, code, signal)
        if (boundary) {
          assertSourceLaunchActive(boundary.custody)
          assert.equal(boundary.records.owner, undefined)
          boundary.records.owner = Object.freeze({ kind: 'KNOWN_EXIT0', role: 'owner', child, code, signal })
        }
        clearTimeout(timer)
        readinessResolved = true
        resolve({ retained: false })
      } catch (error) {
        fail(error)
      }
    })
  })
}

export async function supervisor(packet, directory, selected, nonce, reviewPath, guard) {
  guard.assertActive()
  assert(Object.hasOwn(cases, selected))
  assert.deepEqual(controllerProcess.execArgv, [])
  const manifest = verifyPacket(packet, reviewPath, selected) // No allocation/launch before exact inputs/review verify.
  mkdirSync(directory)
  const env = environment(directory)
  const setupScript = path.join(packet, 'source-custody-setup.mjs')
  const boundary = createSourceControllerBoundary(guard, { directory, selected, nonce })
  const { custody, records } = boundary
  try {
    write(directory, 'attempt.json', {
      nonce,
      selected,
      supervisorPid: controllerProcess.pid,
      supervisorExecArgv: controllerProcess.execArgv,
      environmentKeys: Object.keys(env).sort(),
      detached: true,
      childExecArgv: [],
      status: 'CONSUMED_NO_RETRY',
    })
    const setup = launch(custody, setupScript, [packet, directory, selected, 'setup'], directory, env, 'setup', false)
    await knownExit(setup, directory, 'setup', 30_000, boundary)
    assertSourceLaunchActive(custody)
    const script = path.join(
      packet,
      cases[selected].cleanup ? 'source-custody-cleanup-owner.mjs' : 'source-custody-owner.mjs',
    )
    const args = [directory, cases[selected].cleanup ?? selected, nonce]
    const owner = launchSourceOwner(custody, manifest, packet, script, args, directory, env, selected, nonce)
    const outcome = await observeOwner(owner, directory, selected, nonce, boundary)
    assertSourceLaunchActive(custody)
    if (!outcome.retained && cases[selected].inspect) {
      const inspector = launch(
        custody,
        setupScript,
        [packet, directory, selected, 'inspect'],
        directory,
        env,
        'inspector',
        false,
      )
      await knownExit(inspector, directory, 'inspector', 30_000, boundary)
      assertSourceLaunchActive(custody)
    }
    const result = {
      selected,
      nonce,
      supervisorPid: controllerProcess.pid,
      ownerPid: owner.pid,
      status: outcome.retained ? 'EXPECTED_RETAINED_SUPERVISOR_EXIT' : 'KNOWN_OWNER_EXIT0',
    }
    if (outcome.retained) outcome.finalize(() => write(directory, 'supervisor-result.json', result))
    else write(directory, 'supervisor-result.json', result)
    guard.assertActive()
    custody.complete(records)
  } catch (error) {
    failSourceLaunch(custody, custody.currentRole ?? 'setup', 'supervisor-continuation', error)
    publishSourceLaunchFailure(custody, directory)
    try {
      write(directory, 'supervisor-failure.json', {
        error: String(error.message).slice(0, 2000),
        noCleanupOrKill: true,
      })
    } catch (reportError) {
      failSourceLaunch(custody, custody.currentRole ?? 'setup', 'failure-reporter', reportError)
    }
    throw custody.firstError
  }
}
export function observeLiveness(directory) {
  const spawned = read(path.join(directory, 'owner-created.json')),
    exited = read(path.join(directory, 'supervisor-exit.json'))
  assert.equal(exited.code, 0)
  assert.equal(exited.signal, null)
  const args = ['-p', String(spawned.pid), '-o', 'pid=,ppid=,stat=,command=']
  let stdout = '',
    error
  try {
    stdout = execFileSync('/bin/ps', args, {
      env: { PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
      timeout: 1000,
      maxBuffer: 16384,
    })
  } catch (actual) {
    error = String(actual.message).slice(0, 1000)
  }
  write(directory, 'post-supervisor-liveness.json', {
    executable: '/bin/ps',
    args,
    maximumBytes: 16384,
    timeoutMs: 1000,
    actualSupervisorExitAlreadyObserved: exited,
    originalSpawn: spawned,
    stdout,
    error,
    claim: 'POINT_IN_TIME_OWNER_RETENTION_ONLY_NOT_QUIESCENCE',
  })
  assert(!error)
  const lines = stdout.trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(Number(lines[0].trim().split(/\s+/, 1)[0]), spawned.pid)
  assert(lines[0].includes(spawned.script) && lines[0].includes(spawned.nonce))
  assert(!/^\s*\d+\s+\d+\s+Z/.test(lines[0]), 'Zombie is not a retained owner')
}
async function admission(directory, nonce) {
  mkdirSync(directory, { recursive: true })
  const lock = path.join(directory, 'admission'),
    stop = path.join(directory, 'STOP.json')
  const until = Date.now() + 60_000
  while (Date.now() < until) {
    assert(!existsSync(stop), 'Prior invariant failure STOP; no automatic retry/adoption')
    try {
      mkdirSync(lock)
      write(lock, 'owner.json', { nonce, testPid: controllerProcess.pid, acquiredAt: new Date().toISOString() })
      return () => {
        assert.equal(read(path.join(lock, 'owner.json')).nonce, nonce)
        rmSync(lock, { recursive: true }) // Only this exact own admission; never a stale lock.
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Bounded admission queue expired; no stale lock adoption')
}
export async function runSourceCustodyCase(selected) {
  assert(Object.hasOwn(cases, selected))
  return runSourceCustodyTransport(selected, controllerScript)
}
/**
 * @typedef {Readonly<{packet:string, preparation:string, directory:string, selected:string,
 * nonce:string, canonicalInputDigest:string} & ({mode:'CANONICAL', reviewPath?:never} |
 * {mode:'EXTERNAL_REVIEWED', reviewPath:string})>} SourcePreparedCase
 */
/** @param {SourcePreparedCase} prepared */
async function runPreparedSourceCase(prepared, boundary, guard) {
  assert(['CANONICAL', 'EXTERNAL_REVIEWED'].includes(prepared.mode))
  for (const key of ['packet', 'preparation', 'directory', 'selected', 'nonce', 'canonicalInputDigest'])
    assert(
      typeof prepared[key] === 'string' && prepared[key].length > 0,
      'Complete prepared source-case identity required',
    )
  const { packet, preparation, directory, selected, nonce, canonicalInputDigest } = prepared
  const { custody, records } = boundary
  const supervisorScript = path.join(packet, 'source-custody-controller.mjs')
  const argv = [supervisorScript, '--supervisor', packet, directory, selected, nonce]
  if (prepared.mode === 'EXTERNAL_REVIEWED') {
    assert(path.isAbsolute(prepared.reviewPath))
    argv.push(prepared.reviewPath)
  } else assert.equal(prepared.reviewPath, undefined)
  const child = launchSourceChild(custody, 'supervisor', {
    kind: 'spawn-ignored',
    execPath: controllerProcess.execPath,
    argv,
    cwd: preparation,
    env: { PATH: path.dirname(controllerProcess.execPath) + ':/usr/bin:/bin' },
    detached: true,
    stdio: 'ignore',
  })
  await knownExit(child, preparation, 'supervisor', 120_000, boundary)
  assertSourceLaunchActive(custody)
  const exit = read(path.join(preparation, 'supervisor-exit.json'))
  write(directory, 'supervisor-exit.json', exit) // Actual distinct child exit observed before any liveness command.
  const result = read(path.join(directory, 'supervisor-result.json'))
  assert.equal(result.nonce, nonce)
  if (prepared.mode === 'EXTERNAL_REVIEWED') assert.equal(result.selected, selected)
  if (result.status === 'EXPECTED_RETAINED_SUPERVISOR_EXIT') observeLiveness(directory)
  else assert.equal(result.status, 'KNOWN_OWNER_EXIT0')
  guard.assertActive()
  custody.complete(records)
  return { ...result, directory, canonicalInputDigest }
}

async function runDirectSourceCustodyCase(selected, guard) {
  guard.assertActive()
  assert(Object.hasOwn(cases, selected))
  const { canonicalInputs, buildSourceCustodyPacket } = await import('./build-source-custody.mjs')
  const { root } = await import('./source-custody-client.mjs')
  const canonical = canonicalInputs(),
    nonce = randomUUID()
  const campaign = path.join(root, '.appraisejs/source-custody-regressions', canonical.digest)
  const release = await admission(campaign, nonce)
  let directory
  const boundary = createSourceControllerBoundary(guard, { directory: campaign, selected, nonce })
  const { custody } = boundary
  try {
    assert(!existsSync(path.join(campaign, 'STOP.json')))
    const preparation = mkdtempSync(path.join(campaign, 'preparation-'))
    write(preparation, 'campaign.json', {
      nonce,
      selected,
      canonicalInputDigest: canonical.digest,
      testPid: controllerProcess.pid,
    })
    const packet = path.join(preparation, 'packet')
    await buildSourceCustodyPacket(packet)
    assertSourceLaunchActive(custody)
    directory = path.join(preparation, 'attempt')
    return await runPreparedSourceCase(
      Object.freeze({
        mode: 'CANONICAL',
        packet,
        preparation,
        directory,
        selected,
        nonce,
        canonicalInputDigest: canonical.digest,
      }),
      boundary,
      guard,
    )
  } catch (error) {
    failSourceLaunch(custody, custody.currentRole ?? 'supervisor', 'campaign-continuation', error)
    publishSourceLaunchFailure(custody, campaign)
    try {
      if (!existsSync(path.join(campaign, 'STOP.json')))
        write(campaign, 'STOP.json', {
          nonce,
          selected,
          directory,
          error: String(error.message).slice(0, 2000),
          noAutomaticRetry: true,
        })
    } catch (reportError) {
      failSourceLaunch(custody, 'supervisor', 'failure-reporter', reportError)
    }
    throw custody.firstError
  } finally {
    try {
      release()
    } catch (error) {
      failSourceLaunch(custody, 'supervisor', 'campaign-continuation', error)
      publishSourceLaunchFailure(custody, campaign)
      throw custody.firstError
    }
  }
}
// External-only identity is fixed to the independently reviewed physical C; no client generation/fallback.
const externalSourceClientEntry =
  '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/worktrees/custody-fix/.tmp/m06-source8-template-dependencies1/env-root/a/b/c/d/e/client/index.js'
const externalSourcePhysicalReview = 'dff065ce5f5f8e3a6407f678a3f782bbd5b6256f018e7db0ca74137c3c4fb609'
const externalNonce = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function assertExternalPath(filename, absent = false) {
  assert(typeof filename === 'string' && path.isAbsolute(filename) && path.resolve(filename) === filename)
  const physical = absent ? path.dirname(filename) : filename
  assert.equal(realpathSync(physical), physical, 'Canonical physical external-case path required')
}
// Complete four-field external admission grammar, separate from whole-table uniqueness and selection.
function validateExternalAdmission(row, packet) {
  assert(row && typeof row === 'object' && !Array.isArray(row))
  assert.equal(Object.keys(row).sort().join(','), 'campaign,nonce,packet,selected')
  assert.equal(row.packet, packet)
  assert(typeof row.selected === 'string', 'Primitive external admission case required')
  assert(Object.hasOwn(cases, row.selected))
  assertExternalPath(row.campaign, true)
  assert(typeof row.nonce === 'string' && externalNonce.test(row.nonce))
}
function validateExternalAdmissions(rows, identity) {
  assert(Array.isArray(rows) && rows.length === Object.keys(cases).length, 'Exactly eighteen external admissions')
  const selected = new Set(),
    campaigns = new Set(),
    nonces = new Set()
  let matches = 0
  for (const row of rows) {
    validateExternalAdmission(row, identity.packet)
    assert(!selected.has(row.selected) && !campaigns.has(row.campaign) && !nonces.has(row.nonce))
    selected.add(row.selected)
    campaigns.add(row.campaign)
    nonces.add(row.nonce)
    if (row.campaign === identity.campaign && row.selected === identity.selected && row.nonce === identity.nonce)
      matches++
  }
  assert.equal(matches, 1, 'One exact reviewed external-case tuple required')
}
async function runExternalSourceCustodyCase(packet, campaign, selected, nonce, reviewPath, guard) {
  guard.assertActive()
  assertExternalPath(packet)
  assertExternalPath(campaign, true)
  assertExternalPath(reviewPath)
  assert(typeof selected === 'string', 'Primitive external invocation case required')
  assert(Object.hasOwn(cases, selected))
  assert(typeof nonce === 'string' && externalNonce.test(nonce))
  const identity = Object.freeze({ packet, campaign, selected, nonce, reviewPath })
  const manifestBytes = readFileSync(path.join(packet, 'manifest.json')),
    reviewBytes = readFileSync(reviewPath)
  const manifest = verifyPacket(packet, reviewPath, selected)
  assert.equal(hash(readFileSync(path.join(packet, 'manifest.json'))), hash(manifestBytes))
  assert.equal(hash(readFileSync(reviewPath)), hash(reviewBytes))
  assert.equal(manifest.clientRuntimeSafe, true)
  assert.equal(manifest.clientBinding?.origin, 'REVIEWED_RELOCATION')
  assert.equal(manifest.clientBinding.physicalReview.sha256, externalSourcePhysicalReview)
  assert.equal(manifest.controllerRuntimeReviewRequired, true)
  assert.equal(manifest.generatedEntry, externalSourceClientEntry)
  const review = JSON.parse(reviewBytes)
  validateExternalAdmissions(review.externalCaseAdmissions, identity)
  const consumed = Object.freeze({
    status: 'CONSUMED_SOURCE_EXTERNAL_C_CAMPAIGN_NO_RETRY',
    ...identity,
    testPid: controllerProcess.pid,
    packetManifestSha256: hash(manifestBytes),
    reviewSha256: hash(reviewBytes),
  })
  assert(!existsSync(campaign), 'Fresh external campaign only; no retry/adoption')
  mkdirSync(campaign)
  const directory = path.join(campaign, 'attempt')
  const boundary = createSourceControllerBoundary(guard, { directory: campaign, selected, nonce })
  const { custody } = boundary
  try {
    write(campaign, 'campaign.json', consumed)
    return await runPreparedSourceCase(
      Object.freeze({
        mode: 'EXTERNAL_REVIEWED',
        packet,
        preparation: campaign,
        directory,
        selected,
        nonce,
        canonicalInputDigest: manifest.canonicalInputDigest,
        reviewPath,
      }),
      boundary,
      guard,
    )
  } catch (error) {
    failSourceLaunch(custody, 'supervisor', 'external-campaign-continuation', error)
    publishSourceLaunchFailure(custody, campaign)
    try {
      write(campaign, 'STOP.json', {
        ...consumed,
        directory,
        error: String(error?.message).slice(0, 2000),
        noAutomaticRetry: true,
      })
    } catch (reportError) {
      failSourceLaunch(custody, 'supervisor', 'failure-reporter', reportError)
    }
    throw custody.firstError
  }
}

if (controllerProcess.argv[1] && path.resolve(controllerProcess.argv[1]) === fileURLToPath(import.meta.url)) {
  if (controllerProcess.argv[2] === '--supervisor') {
    runSourceDirectEntry(guard =>
      supervisor(
        controllerProcess.argv[3],
        controllerProcess.argv[4],
        controllerProcess.argv[5],
        controllerProcess.argv[6],
        controllerProcess.argv[7],
        guard,
      ),
    )
  } else if (controllerProcess.argv[2] === '--external-case') {
    runSourceDirectEntry(guard => {
      assert.equal(controllerProcess.argv.length, 8, 'Exact external-case arguments required')
      const [packet, campaign, selected, nonce, reviewPath] = controllerProcess.argv.slice(3)
      return runExternalSourceCustodyCase(packet, campaign, selected, nonce, reviewPath, guard)
    })
  } else if (controllerProcess.argv[2] === '--case' || controllerProcess.argv[2] === '--campaign') {
    runSourceDirectEntry(async guard => {
      const [selected, directory, nonce] = controllerProcess.argv.slice(3)
      const request = readSourceTransportRequest(directory, selected, nonce, controllerScript)
      const result = await runDirectSourceCustodyCase(selected, guard)
      guard.assertActive()
      publishSourceTransportResult(request, directory, result, guard)
    })
  }
}
